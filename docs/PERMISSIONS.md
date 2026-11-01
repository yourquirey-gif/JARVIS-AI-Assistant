# ULTRON permission and safety model

## Browser permissions
- Microphone: required for voice recognition and voice activity display.
- Notifications, location and Bluetooth: optional and requested separately.
- Installing the website as a PWA does not grant operating-system access.

## Desktop companion
The desktop companion must be run on the PC being controlled. It creates a random pairing key, stores it in the user's local AppData folder, allows only explicitly configured website origins, and binds the service to 127.0.0.1.
The user must deliberately enable PC actions in the desktop companion, copy the pairing key, and pair from the website.
Each action appears as a confirmation card before execution.

## Allowlisted actions
- Open selected websites and valid HTTP/HTTPS URLs.
- Launch a fixed list of built-in Windows applications.
- Open standard user folders.
- Read basic CPU, RAM and battery status.
- List folder names on Desktop.

## Explicitly excluded
Arbitrary shell or PowerShell commands, password/credential access, silent recording, unrestricted filesystem access, destructive file operations, purchases, sending messages, changing security controls, shutdown and restart.

## Wake-word limitation
Wake-word listening uses the browser's speech-recognition service. It runs only while the ULTRON web app is open, microphone permission is granted, and the user has explicitly started listening. It is not an OS-level always-on background listener. Recognition and voice quality depend on browser and installed system voices.

## Browser compatibility
The deployed website must use HTTPS. Modern browsers may show a separate Local Network / Loopback access prompt when a public website connects to localhost. Browser support varies. If local pairing fails, check that the desktop companion is running, PC actions are enabled, the exact website origin is configured, the pairing key is correct, and the browser permits local-network access.
