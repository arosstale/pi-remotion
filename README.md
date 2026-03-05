# pi-remotion

Remotion + ffmpeg extension for [pi](https://github.com/badlogic/pi-mono). Render programmatic videos with Remotion, post-process with ffmpeg — all from pi commands and LLM tools.

## Install

```bash
pi install path:~/Projects/pi-remotion
```

## Commands (slash commands for the human)

| Command | Description |
|---|---|
| `/ffprobe <file>` | Inspect video/audio — duration, resolution, codec, bitrate |
| `/transcode` | Convert between formats, change codec/res/fps, trim, compress |
| `/frames` | Extract frames as PNG/JPG images |
| `/gif` | Convert video clip to optimized animated GIF |
| `/addaudio` | Mux audio track onto a video |
| `/extractaudio` | Rip audio track from a video |
| `/concat` | Join multiple video files |
| `/thumbnail` | Grab a single frame as an image |
| `/render` | Trigger Remotion render (runs `node render.mjs`) |

## LLM Tools (the agent can call these directly)

| Tool | Description |
|---|---|
| `video_probe` | Get file info (duration, resolution, codec, bitrate) |
| `video_transcode` | Transcode with codec/quality/resolution/trim options |
| `video_to_gif` | Convert to GIF with palette optimization |
| `video_add_audio` | Mux audio onto video |
| `video_concat` | Join multiple files |
| `remotion_render` | Render a Remotion project |

## Prerequisites

- **ffmpeg** + **ffprobe** on PATH
- **Node.js** for Remotion rendering
- Remotion projects need their own `node_modules` (run `npm install` in the project dir)

## Examples

```
/ffprobe presentations/talk.mp4
/gif input=talk.mp4 output=preview.gif start=00:00:10 duration=00:00:05 width=640
/transcode input=raw.mov output=compressed.mp4 codec=h264 crf=23 scale=1920:-1
/render project=~/Projects/gh-repo/remotion
```

## License

MIT
