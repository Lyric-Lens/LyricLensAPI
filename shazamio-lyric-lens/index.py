import asyncio
from shazamio import Shazam
import json

# TODO: Create into an API
def pretty_print_json(json_object):
  print(json.dumps(json_object, indent=4, sort_keys=True))

async def recognizer():
  shazam = Shazam()
  out = await shazam.recognize("Y2meta.app - Thaf - What You Won't Do For Love (Audio) (64 kbps).mp3")
  pretty_print_json(out)

asyncio.run(recognizer())