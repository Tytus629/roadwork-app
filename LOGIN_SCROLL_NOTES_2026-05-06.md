# Login Screen Scroll Notes (iOS + Android)

## What we added
- Updated the login/auth screen layout in src/screens/AuthScreen.tsx to use a ScrollView inside KeyboardAvoidingView.
- Added keyboard-friendly scroll behaviors:
  - keyboardShouldPersistTaps="handled"
  - keyboardDismissMode="on-drag"
  - contentInsetAdjustmentBehavior="always"
- Changed the main auth content container from fixed flex layout to flexGrow-based scroll content so the form can scroll when vertical space is limited.

## Why we added this
- On smaller phones and when the keyboard is open, parts of the login form could be pushed off-screen.
- A fixed centered layout made it hard or impossible to reach all fields/buttons.
- The new scrollable layout ensures users can always access Sign In / Create Account inputs and action buttons on both iOS and Android.

## Outcome
- Login screen can scroll vertically on iOS and Android.
- Keyboard interaction is improved, and users can drag to dismiss keyboard while still accessing all controls.
