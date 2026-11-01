# Android release signing

ULTRON Android releases must use one persistent release keystore. Do not publish APKs built with a fresh GitHub Actions debug keystore: Android will reject an update when the signing certificate differs from the installed app.

Create these four repository Actions secrets under Settings → Secrets and variables → Actions:

- `ULTRON_ANDROID_KEYSTORE_BASE64`: Base64 contents of the private JKS file.
- `ULTRON_ANDROID_KEYSTORE_PASSWORD`: JKS store password.
- `ULTRON_ANDROID_KEY_ALIAS`: private-key alias.
- `ULTRON_ANDROID_KEY_PASSWORD`: private-key password.

The Android workflow decodes the keystore into the runner's temporary directory, configures the Gradle release signing block, builds `assembleRelease`, and publishes the signed APK. The keystore must never be committed to the repository or printed in CI logs.

The first APK signed with this new key cannot update an app installed with an older, different debug certificate. Users must uninstall that older ULTRON build once, then install the first stable-signed APK. This may erase the app's local data. Every later APK signed with the same keystore can update it normally, provided the package ID stays `com.dsacademy.ultron` and the versionCode increases.

Keep an offline backup of the JKS file and passwords. Losing or replacing this key means users will again need to uninstall and reinstall ULTRON to move to a different signing certificate.
