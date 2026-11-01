# ULTRON compatibility and rendering

## Windows compatibility
The website renders its hologram using Canvas 2D. It does not require WebGL, so older graphics cards can still display the avatar. Auto quality looks at available CPU cores and device memory; low quality reduces frame rate, pixel ratio and background effects. High quality enables more detail and faster motion.

The build output is transpiled for Chromium 109, Edge 109 and Firefox 115-era engines. This is intended to improve compatibility with the last browser generations available on Windows 7. Windows 7 is unsupported by Microsoft and current browsers; working depends on the installed browser, graphics driver, audio devices and security settings. No application can promise compatibility with every old PC.

## Avatar animation
The avatar is an original Canvas 2D metallic robot illustration. During speech synthesis, its jaw moves and arms/hands perform a restrained gesture animation. This is not a photorealistic 3D model or a licensed movie character model. It deliberately avoids WebGL and external 3D assets to reduce hardware and download requirements.

## Browser voice requirements
Microphone recognition requires a browser that implements SpeechRecognition / webkitSpeechRecognition and user-granted microphone permission. Speech synthesis uses voices installed on Windows. The web app must remain open while wake-word mode is active; a website cannot run an always-on microphone after the browser is closed.

## PC access security
The companion listens only on 127.0.0.1 and only accepts the exact configured website origin plus a private pairing key. Each allowlisted operation requires a separate approval. Arbitrary shell execution and destructive operations remain disabled.
