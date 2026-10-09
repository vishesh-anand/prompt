#!/bin/bash
# One-time: create the dedicated test simulator the scripted flows run on. iOS 26.2 on purpose: iOS 27 currently quits the
# app at launch (it hasn't adopted the UIScene lifecycle yet), which would fail every flow before it starts.
set -euo pipefail

name="Prompt E2E"
if xcrun simctl list devices | grep -q "$name ("; then
  echo "\"$name\" already exists."
else
  xcrun simctl create "$name" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-2 >/dev/null
  echo "Created \"$name\"."
fi

udid=$(xcrun simctl list devices | grep "$name (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)
xcrun simctl boot "$udid" 2>/dev/null || true

cat <<MSG

The "$name" simulator is booted. Open its window from Xcode (Window > Devices and Simulators > Simulators, or the simulator picker),
then, once, by hand in it:
  1. Settings > Sign in to your Apple Account.
  2. Build and install the test app:  e2e/run.sh --build
  3. Open Prompt and sign in with Apple. The login stays on this simulator between runs and reinstalls.
MSG
