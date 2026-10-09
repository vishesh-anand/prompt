#!/bin/bash
# Makes two spoken test answers with the Mac's built-in voice and puts them in the test simulator's copy of the app
# (Documents/e2e). Synthetic speech, so no real person's voice is recorded or stored, and the audio folder is git-ignored.
#   first.m4a  has fillers ("um", "basically", "like", "you know"), so there is something to improve.
#   retry.m4a  is the tighter version.
# Each is well over 10 seconds, because answers under 10 are not scored.
set -euo pipefail
cd "$(dirname "$0")"

udid="${1:?usage: make-clips.sh <simulator udid>}"
mkdir -p .audio

make() {
  local name="$1" text="$2"
  say -v Samantha -r 170 -o ".audio/$name.aiff" "$text"
  afconvert -f m4af -d aac ".audio/$name.aiff" ".audio/$name.m4a"
  local seconds
  seconds=$(afinfo ".audio/$name.m4a" | awk '/estimated duration/ {print $3}')
  awk -v s="$seconds" -v n="$name" 'BEGIN { printf "{\"durationMs\": %d}\n", s * 1000 }' > ".audio/$name.json"
  echo "$name: $seconds seconds"
}

make first "Um, so basically, I think, like, the main thing is, uh, that we should, you know, ship the smaller version first. Basically, um, it lets us learn faster, and, uh, like, it costs less. So, yeah, um, that is what I would do."
make retry "I would ship the smaller version first. It lets us learn faster, and it costs less. The risk is that we miss a feature some people need, so I would ask five customers this week before we start building. That way we spend a few days, not a few months, finding out what matters."

container=$(xcrun simctl get_app_container "$udid" com.visheshanand.prompt data)
mkdir -p "$container/Documents/e2e"
cp .audio/first.m4a .audio/first.json .audio/retry.m4a .audio/retry.json "$container/Documents/e2e/"
echo "Clips copied into $container/Documents/e2e"
