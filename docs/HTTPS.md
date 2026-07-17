# Local HTTPS

Estate360 uses Caddy's local certificate authority so camera capture works from a phone on the same LAN. The app is served at `https://<HTTPS_HOST>` and S3 media at `https://<HTTPS_HOST>:9443`.

## Windows setup

1. Start Docker Desktop.
2. Set `HTTPS_HOST` in `.env` to this computer's current LAN IPv4, without `https://` or a port. The bootstrap can detect the active default-route address when the setting is absent.
3. From the repository root, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-https.ps1
   ```

   Override the address for one run with `-HttpsHost 10.29.52.70`. The script builds and starts Compose, waits for Caddy, copies only its public root certificate to `.certs/caddy-local-root.crt`, and trusts it in `CurrentUser\Root`; administrator access and `LocalMachine` trust are not used.

The script prints and probes the app, public listings API, and media origin. A `401` or `403` from the media origin root is normal. To remove Windows trust, open `certmgr.msc`, go to **Trusted Root Certification Authorities > Certificates**, and delete the Caddy local authority matching the thumbprint printed by the script. The ignored `.certs` copy can then be deleted.

## Trust on a phone

Transfer `.certs/caddy-local-root.crt` directly to the test phone, then install it only for local development:

- **Android:** Settings paths vary; search for **Install a CA certificate** (often under Security > Encryption & credentials). Remove it later under **Trusted credentials > User**.
- **iPhone/iPad:** install the downloaded profile under **Settings > General > VPN & Device Management**, then enable it under **Settings > General > About > Certificate Trust Settings**. Remove the profile under **VPN & Device Management** when finished.

Connect the phone to the same LAN and open the app URL printed by the script. A private CA can authenticate certificates it issues, so do not share it publicly and remove phone trust after testing.

## Network changes and camera access

LAN addresses can change when Wi-Fi or hotspots change. If the active address differs, update `HTTPS_HOST` in `.env` and rerun the bootstrap so Compose/Caddy serves a certificate for the new address. Reopen the newly printed URL; the existing root normally remains trusted while Caddy issues a new leaf certificate.

Browser camera APIs require a secure context. `localhost` is a special case only on the computer itself; `http://<LAN-IP>` is not secure on a phone. Use the trusted `https://<HTTPS_HOST>` URL or camera permission/capture will be unavailable.
