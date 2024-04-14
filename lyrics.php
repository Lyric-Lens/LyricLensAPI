<?php

$type = $_GET['type'];

include_once('./Musixmatch.php');

$musix = new MusixLyricsApi\Musix();
$musix->checkTokenExpire();

function convertLyricsToJson($input) {
   $input_array = [];
   $lines = explode("\n", $input);

   foreach ($lines as $line) {
       $parts = preg_split('/\s+/', $line);
       $timestamp = $parts[0];
       $lyrics = trim(implode(" ", array_slice($parts, 1)));

       $new_array = [
           'timestamp' => $timestamp,
           'lyrics' => $lyrics
       ];
       array_push($input_array, $new_array);
   }

   foreach ($input_array as &$val) {
      // Remove brackets from the timestamp
      $timestamp = trim($val['timestamp'], '[]');
      $timestamp_parts = explode(":", $timestamp);

      // Check if the timestamp has the correct format
      if (count($timestamp_parts) == 2) {
          list($MM, $SS) = $timestamp_parts;
          $convertedTimestamp = intval($MM) * 60 + intval($SS);
          $val['timestamp'] = $convertedTimestamp;
      }
  }

   usort($input_array, function($a, $b) {
       if (isset($a['timestamp']) && isset($b['timestamp'])) {
           return $a['timestamp'] - $b['timestamp'];
       }
       return 0;
   });

   return json_encode($input_array);
}

if($type === 'default') {
$query = urlencode($_GET['q']);
$track_id = $musix->searchTrack($query);
if($track_id != null) {
$response = $musix -> getLyrics($track_id);
$response = convertLyricsToJson($response);
   if(isset($response)) {
      header('Content-Type: application/json');
      echo '{ "lyrics": '.$response.' }';
    //   echo $response;
   } else {
      echo '{
            "error":"Lyrics seems like doesn\'t exist.",
            "isError":true
            }';
   }
} else {

echo '{
            "error":"Track id seems like doesn\'t exist.",
            "isError":true
            }';

}
} else {

$title = urlencode($_GET['t']);
$artist = urlencode($_GET['a']);
$duration = $_GET['d'];
if($duration != null) {
$lyrics = $musix->getLyricsAlternative($title, $artist, convertDuration($duration));
} else {
$lyrics = $musix->getLyricsAlternative($title, $artist);
}
if($lyrics != null) {
      echo $lyrics;
} else {

echo '{
            "error":"Track id seems like doesn\'t exist.",
            "isError":true,
            "title":"'.$title.'",
            "artist":"'.$artist.'",
            "duration":"'.convertDuration($duration).'"
            }';

}
}

function convertDuration($time) {
list($minutes, $seconds) = explode(":", $time);
$totalSeconds = ($minutes * 60) + $seconds;

return $totalSeconds;
}

?>