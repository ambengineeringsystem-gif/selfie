Selfie — Static hosting notes

This `public/` folder contains the static client for a small camera<->viewer WebRTC app.

Quick summary

- You can host these files on GitHub Pages (or any static host). However, WebRTC requires a signaling server (WebSocket) to exchange SDP/ICE. GitHub Pages cannot run a WebSocket server.

Options to make the app work when hosting `public/` as static:

1) Host the signaling server separately (recommended)
   - Deploy the project's `server.js` to a small Node host (Render, Fly, Vercel Serverless, DigitalOcean App Platform, Heroku, etc.). The repository already includes a simple Express + ws server (`server.js`).
   - When the server is running at `wss://example.com`, open the static pages with the `signal` query param — for example:
     - https://<your-gh-pages>/camera.html?signal=wss://example.com
     - https://<your-gh-pages>/viewer.html?signal=wss://example.com
   - The client will use that signaling server to establish connections.

2) Host the entire project (static files + server) on a Node host
   - Deploy the whole repo (not only `public/`) to a Node host that serves static files and runs `server.js`. Render and Heroku support this.

3) Local testing
   - Run the server locally (it will serve the `public/` folder and provide the `/ws` endpoint):

     npm install
     npm start

   - Then open the pages at http://localhost:3000/camera.html and http://localhost:3000/viewer.html

Notes

- The client supports a `?signal=` query parameter. If present it will use that host/URL for the websocket signaling endpoint.
- All asset paths have been converted to relative paths so the site works from a repo subpath (e.g., GitHub Pages).
- If you want a fully self-contained one-click deploy, choose "Deploy from GitHub" on a Node host (Render) which will run `server.js` and serve the static files under the same domain.

If you want, I can:
- Add a tiny GitHub Actions workflow to automatically deploy the server to Render or a similar service.
- Add instructions to the root `README.md` for a one-click deploy to Render/Heroku.
