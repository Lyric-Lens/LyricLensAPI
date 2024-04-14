// List of endpoints:
// 1. Authentication

// 2. USERS ENDPOINTS
// 2.1 GET user details by ID

// 3. MUSIC ENDPOINTS
// 3.1 POST search music
// 3.2 GET lyrics

import express from 'express';
import bcrypt from 'bcrypt';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { searchMusics } from 'node-youtube-music'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

const app = express();

dotenv.config();

app.use(express.json());

let db;

(async () => {
  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    db = client.db('lyric-lens');
  } catch (error) {
    console.error(error);
  }
})();

// 0. CORS stuff
app.use((req, res, next) => {
  const origin = req.header('Origin');
  if (!origin) {
    return next();
  }
  res.header('Access-Control-Allow-Origin', 'http://localhost');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// 1. Authentication
app.post('/v1/authentication', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Query if email already exists
    const user = await db.collection('users').findOne({ email });

    if (user) {
      // Compare hashed password
      const isMatch = await bcrypt.compare(password, user.password);

      if (isMatch) {
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        // Update user with token
        await db.collection('users').updateOne({ _id: user._id }, {
          $set: {
            token,
          }
        });

        res.status(200).send({
          message: "Authentication successful",
          userId: user._id,
          token: token,
        });
      } else {
        res.status(401).send({
          message: "Wrong password",
        });
      }
    } else {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new user
      const newUser = await db.collection('users').insertOne({
        email,
        username,
        password: hashedPassword,
        photo: null,
        'rec-metadata': [],
        stats: {
          'listening_time': 0,
          'music_count': 0,
          'playlist_count': 0,
        },
        token: null,
      });

      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Update user with token
      await db.collection('users').updateOne({ _id: newUser.insertedId }, {
        $set: {
          token,
        }
      });

      res.status(200).send({
        message: "Authentication successful",
        userId: newUser.insertedId,
        token: token,
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Something went wrong with the server",
    });
  }
});


// 2.1 GET user details by ID
app.get('/v1/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const token = req.header('Authorization').replace('Bearer ', '');
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });

    if (user && user.token === token) {
      res.status(200).send({
        message: "User found",
        user: user
      });
    } else {
      res.status(401).send({
        message: "User not found or authenticated",
      })
    }
  }
  catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Something went wrong with the server",
    });
  }
})

// 3.1 POST search music
app.post('/v1/searchMusic', async (req, res) => {
  try {
    // Authorize user request
    const token = req.header('Authorization').replace('Bearer ', '');
    if (token) {
      const user = await db.collection('users').findOne({ token });
      if (user) {
        // Get search query
        const results = await searchMusics(req.body.search);
        res.status(200).send({
          message: "Search successful",
          results: results
        })
      } else {
        res.status(401).send({
          message: "User not found or authenticated",
        })
      }
    }
  }
  catch (error) {
    res.status(500).send({
      message: "Something went wrong with the server",
    });
  }
})

// 3.2 GET lyrics
app.get('/v1/lyrics/:author/:title/:yt_id', async (req, res) => {
  try {
    // Authorize user request
    const token = req.header('Authorization').replace('Bearer ', '');
    if (token) {
      const user = await db.collection('users').findOne({ token });
      if (user) {
        // Check if music already exist in database
        const music = await db.collection('lyrics').findOne({ yt_id: req.params.yt_id });
        if (music) {
          res.status(200).send({
            message: "Lyrics found in database",
            lyrics: music.lyrics
          })
        } else {
          // fetch(`https://lyrics-finder-api.vercel.app/lyrics?song=${req.params.title + ' ' + req.params.author}`) // Without timestamps
          fetch(`http://localhost:80/LyricLensAPI/lyrics/lyrics.php?q=${req.params.title + ' ' + req.params.author}&type=default`) // With timestamps
            .then((response) => response.json())
            .then((data) => {
              res.status(200).send({
                message: "Lyrics found",
                lyrics: data
              })
            })
            .catch((err) => {
              console.log(err);
              res.status(500).send({
                message: "Something went wrong with the server",
              })
            });
        }
      }
    }
  }
  catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Something went wrong with the server",
    })
  }
})

// 3.3 POST lyrics to Gemini
app.post('/v1/lyrics/gemini', async (req, res) => {
  try {
    // Authorize user request
    const token = req.header('Authorization').replace('Bearer ', '');
    if (token) {
      const user = await db.collection('users').findOne({ token });
      if (user) {
        // Check if music already stored in database, both by yt id and by author and title
        const music = await db.collection('musics').findOne({ yt_id: req.body.youtubeId })
        // Use existing data
        if (music) {
          res.status(200).send({
            message: "Music already stored in database",
            interpretation: music.interpretation,
          })
        }
        // Query Gemini for interpretation
        else {
          async function run() {
            const Gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = Gemini.getGenerativeModel({ model: "gemini-1.0-pro" });
            let lyricsFull = [];
            req.body.lyrics.forEach(lyric => {
              lyricsFull.push(lyric.lyrics);
            })
            const prompt = lyricsFull.join('\n');
      
            const generationConfig = {
              temperature: 0.9,
              topK: 1,
              topP: 1,
              maxOutputTokens: 256,
            };
      
            const safetySettings = [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
            ];
          
            const chat = model.startChat({
              generationConfig,
              safetySettings,
              history: [
              ],
            });
          
            const result = await chat.sendMessage(prompt + '\n \n' + "Analyze and explain the meaning of the song lyrics above in very short and concise manner, if possible below 4 sentences (1 paragraph). Do not assume the title or the author of the song.");
            const response = result.response;

            // Save data to database before finish
            const newMusic = db.collection('musics').insertOne({
              yt_id: req.body.youtubeId,
              title: req.body.title,
              author: req.body.author,
              thumbnail: req.body.thumbnail,
              lyrics: req.body.lyrics,
              interpretation: response.text(),
              is_reviewed: false
            });
      
            return { 'message': "Response by Gemini success", 'ai_request': prompt + '\n \n' + "Analyze and explain the meaning of the song lyrics above in very short and concise manner, if possible below 4 sentences (1 paragraph). Do not assume the title or the author of the song", 'interpretation': response.text() };
          }
          res.status(200).send(await run());
        }
      }
    }
  }
  catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Something went wrong with the server",
    })
  }
})

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));