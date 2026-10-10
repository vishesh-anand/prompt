#!/bin/bash
# Runs the scripted flows against the real app on the "Prompt E2E" simulator.
#   e2e/run.sh            run the flows against the app already installed there
#   e2e/run.sh --build    build the test app (JavaScript bundled in, no Metro needed) and install it first
# Fails if any flow fails, if the app logged an unhandled JavaScript error during the run, or if it wrote a new crash report.
# The flows record real answers: real transcription and Claude, a few cents, counted in the 10 a day.
set -euo pipefail
cd "$(dirname "$0")"

name="Prompt E2E"
udid=$(xcrun simctl list devices | grep "$name (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1 || true)
[ -n "$udid" ] || { echo "No \"$name\" simulator. Run e2e/setup.sh first."; exit 1; }
xcrun simctl boot "$udid" 2>/dev/null || true

if [ "${1:-}" = "--build" ]; then
  # EXPO_PUBLIC_E2E is baked into the bundle: normal builds don't set it, so they contain none of the test-only code.
  (cd ../app && EXPO_PUBLIC_E2E=1 CI=1 npx expo run:ios --configuration Release --device "$name" --no-bundler)
fi

export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk)}"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"

# The microphone prompt is allowed up front so the flows don't depend on a system dialog.
xcrun simctl privacy "$udid" grant microphone com.visheshanand.prompt
./make-clips.sh "$udid"

# A JavaScript error that takes the app down (like the step 6 realtime crash) is logged the moment it happens, so this is
# the reliable check. Crash reports below are only a second net: they can appear a minute after the crash, after this script looks.
started=$(date "+%Y-%m-%d %H:%M:%S")

crashes="$HOME/Library/Logs/DiagnosticReports"
before=$(ls "$crashes" 2>/dev/null | grep -c '^Prompt-.*\.ips$' || true)

status=0
maestro --device "$udid" test flows/01-launch.yaml flows/02-retry-and-compare.yaml --test-output-dir .out || status=$?

js_errors=$(xcrun simctl spawn "$udid" log show --start "$started" --style compact \
  --predicate 'process == "Prompt" AND eventMessage CONTAINS "Unhandled JS Exception"' 2>/dev/null | grep -c "Unhandled JS Exception" || true)
if [ "$js_errors" -gt 0 ]; then
  echo "The app logged $js_errors unhandled JavaScript error(s) during the run. Show them with:"
  echo "  xcrun simctl spawn \"$udid\" log show --start \"$started\" --predicate 'eventMessage CONTAINS \"Unhandled JS Exception\"'"
  status=1
fi

after=$(ls "$crashes" 2>/dev/null | grep -c '^Prompt-.*\.ips$' || true)
if [ "$after" -gt "$before" ]; then
  echo "The app wrote $((after - before)) new crash report(s) in $crashes during the run."
  status=1
fi
exit $status
