// List of endpoints:
// 1. Authentication

// 2. USERS ENDPOINTS
// 2.1 GET user details by ID

// 3. MUSIC ENDPOINTS
// 3.1 POST search music

import express from 'express';
import bcrypt from 'bcrypt';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { searchMusics } from 'node-youtube-music'

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
    const { email, password } = req.body;

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
        password: hashedPassword,
        photo: null,
        'rec-metadata': [],
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));