(function(){
  const joinBtn = document.getElementById('joinBtn');
  const roomInput = document.getElementById('roomInput');
  // these elements may not exist in the trimmed-down HTML, make them mutable so we can create them dynamically
  let remote = document.getElementById('remote');
  let takePhotoBtn = document.getElementById('takePhotoBtn');
  let countdownEl = document.getElementById('countdown');
  let viewerOverlay = document.getElementById('viewerOverlay');
  let overlayClose = document.getElementById('overlayClose');

  let pc;
  let ws;
  let room;
  let dc; // data channel from camera

  function makeRTCConfig() {
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }

  // helper to attach take-photo behavior to a button (works for static or dynamic buttons)
  function attachTakePhotoHandler(button, countdownElem) {
    if (!button) return;
    button.addEventListener('click', async () => {
      if (!dc || dc.readyState !== 'open') return alert('Not connected to camera data channel yet.');
      // schedule 2 seconds in the future to allow both sides to schedule
      const delayMs = 2000;
      const when = Date.now() + delayMs;
      try {
        dc.send(JSON.stringify({ type: 'take-photo', when }));
      } catch (err) { console.error('Failed to send take-photo', err); return; }

      // schedule our local capture
      const localDelay = Math.max(0, when - Date.now());
      if (countdownElem) {
        let remaining = Math.ceil(localDelay / 1000);
        countdownElem.textContent = `Capturing in ${remaining}s`;
        const iv = setInterval(() => {
          const ms = when - Date.now();
          const s = Math.max(0, Math.ceil(ms / 1000));
          countdownElem.textContent = ms > 0 ? `Capturing in ${s}s` : '';
          if (ms <= 0) { clearInterval(iv); countdownElem.textContent = ''; }
        }, 250);
      }
      // no local capture on viewer; countdown is only visual while camera captures and sends its image
    });
  }

  function createPeer() {
    pc = new RTCPeerConnection(makeRTCConfig());

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({ type: 'ice', room, payload: e.candidate }));
      }
    };

    // receive data channel from camera
    pc.ondatachannel = (e) => {
      dc = e.channel;
      dc.onopen = () => console.log('DataChannel open on viewer');
      dc.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === 'photo' && msg.payload) {
                // show the returned photo in a temporary overlay. If the static overlay doesn't exist,
                // create it dynamically so the viewer always sees the returned image.
                let overlay = document.getElementById('photoOverlay');
                let overlayImg = document.getElementById('overlayImage');
                let closeBtn = document.getElementById('closeOverlay');
                let downloadBtn = document.getElementById('downloadOverlay');
                let trashBtn = document.getElementById('trashOverlay');

                if (!overlay) {
                  overlay = document.createElement('div');
                  overlay.id = 'photoOverlay';
                  overlay.style.cssText = 'display:flex;position:fixed;inset:0px;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center;';

                  const container = document.createElement('div');
                  container.style.cssText = 'position:relative;margin:auto;max-width:95%;max-height:95%;display:flex;align-items:center;justify-content:center;';

                  const controls = document.createElement('div');
                  controls.style.cssText = 'position:absolute;top:-8px;right:-8px;display:flex;gap:8px;z-index:10001;';

                  downloadBtn = document.createElement('button');
                  downloadBtn.id = 'downloadOverlay';
                  downloadBtn.className = 'btn';
                  downloadBtn.textContent = 'Download';
                  controls.appendChild(downloadBtn);

                  trashBtn = document.createElement('button');
                  trashBtn.id = 'trashOverlay';
                  trashBtn.className = 'btn';
                  trashBtn.textContent = 'Trash';
                  controls.appendChild(trashBtn);

                  closeBtn = document.createElement('button');
                  closeBtn.id = 'closeOverlay';
                  closeBtn.className = 'btn';
                  closeBtn.textContent = 'Close';
                  controls.appendChild(closeBtn);

                  container.appendChild(controls);

                  overlayImg = document.createElement('img');
                  overlayImg.id = 'overlayImage';
                  overlayImg.alt = 'Captured photo';
                  overlayImg.style.cssText = 'max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.6)';
                  container.appendChild(overlayImg);

                  overlay.appendChild(container);
                  document.body.appendChild(overlay);
                }

                overlayImg.src = msg.payload;
                overlay.style.display = 'flex';
                // auto-hide after 5s
                const hideAfter = 5000;
                const to = setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, hideAfter);

                // cleanup and control wiring
                const cleanup = () => {
                  clearTimeout(to);
                  if (overlay) overlay.style.display = 'none';
                  if (closeBtn) closeBtn.removeEventListener('click', onClose);
                  if (downloadBtn) downloadBtn.removeEventListener('click', onDownload);
                  if (trashBtn) trashBtn.removeEventListener('click', onTrash);
                };
                const onClose = () => { cleanup(); };
                const onDownload = () => {
                  try {
                    if (overlayImg && overlayImg.src) {
                      const a = document.createElement('a');
                      a.href = overlayImg.src;
                      a.download = `photo-${Date.now()}.jpg`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }
                  } catch (err) { console.error('Download failed', err); }
                  cleanup();
                };
                const onTrash = () => { cleanup(); };

        if (closeBtn) closeBtn.addEventListener('click', onClose);
        if (downloadBtn) downloadBtn.addEventListener('click', onDownload);
        if (trashBtn) trashBtn.addEventListener('click', onTrash);
      } else {
            console.log('DataChannel message', msg && msg.type);
          }
        } catch (err) { console.error('Error parsing data channel message', err); }
      };
    };

    pc.ontrack = (e) => {
      // Ensure a video element / overlay exists to show the remote stream. If not, create them dynamically.
      if (!remote) {
        // create fullscreen overlay
        viewerOverlay = document.createElement('div');
        viewerOverlay.id = 'viewerOverlay';
        viewerOverlay.style.cssText = 'display:block;position:fixed;inset:0;z-index:9998;background:#000;';

        // remote video
        remote = document.createElement('video');
        remote.id = 'remote';
        remote.autoplay = true;
        remote.playsInline = true;
        remote.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;display:block';
        viewerOverlay.appendChild(remote);

        // close button
        overlayClose = document.createElement('button');
        overlayClose.id = 'overlayClose';
        overlayClose.className = 'btn';
        overlayClose.textContent = '✕';
        overlayClose.style.cssText = 'position:absolute;left:12px;top:12px;z-index:10001;background:rgba(0,0,0,0.4);color:#fff;border:none;padding:6px 8px;border-radius:6px;';
        viewerOverlay.appendChild(overlayClose);

        // controls container (take photo + countdown)
        const ctrl = document.createElement('div');
        ctrl.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:8%;z-index:10001;display:flex;flex-direction:column;align-items:center;gap:8px;';
        takePhotoBtn = document.createElement('button');
        takePhotoBtn.id = 'takePhotoBtn';
        takePhotoBtn.className = 'btn primary';
        takePhotoBtn.style.cssText = 'padding:10px 18px;font-size:16px;';
        takePhotoBtn.textContent = 'Take Photo';
        countdownEl = document.createElement('div');
        countdownEl.id = 'countdown';
        countdownEl.style.cssText = 'color:#fff;opacity:0.9';
        ctrl.appendChild(takePhotoBtn);
        ctrl.appendChild(countdownEl);
        viewerOverlay.appendChild(ctrl);

        document.body.appendChild(viewerOverlay);

        // attach overlay close handler
        overlayClose.addEventListener('click', () => {
          if (viewerOverlay) viewerOverlay.style.display = 'none';
        });

        // attach take-photo handler for the dynamically created button
        attachTakePhotoHandler(takePhotoBtn, countdownEl);
      }

      remote.srcObject = e.streams[0];
      // show fullscreen overlay when remote stream arrives
      if (viewerOverlay) viewerOverlay.style.display = 'block';
    };
  }

  async function join() {
    // normalize room codes to uppercase so typing/copying is forgiving
    room = roomInput.value.trim().toUpperCase();
    if (!room) return alert('Enter a room code or open from the camera link.');

    ws = new WebSocket(wsUrl());
    ws.addEventListener('open', () => console.log('WS open'));

    createPeer();

    ws.addEventListener('message', async (ev) => {
      try {
        const { type, payload } = JSON.parse(ev.data);
        if (type === 'offer') {
          await pc.setRemoteDescription(payload);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', room, payload: answer }));
        } else if (type === 'ice') {
          await pc.addIceCandidate(payload);
        }
      } catch (e) { console.error(e); }
    });

    // send a "join" message so the server registers us in room (server adds on first message)
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', room, payload: null }));
    });

    // viewer will not request the local camera when only showing remote view
    // This keeps the UI minimal and avoids prompting the user for permission.
  }

  joinBtn.addEventListener('click', join);

  // overlay close hides the fullscreen view (does not fully disconnect)
  if (overlayClose) {
    overlayClose.addEventListener('click', () => {
      if (viewerOverlay) viewerOverlay.style.display = 'none';
    });
  }

  // attach take-photo behavior if the button existed at load time
  if (takePhotoBtn) attachTakePhotoHandler(takePhotoBtn, countdownEl);

  // auto join if ?room= present
  const pre = getParam('room');
  if (pre) {
    roomInput.value = pre;
    // small delay to show UI then join
    setTimeout(() => join(), 300);
  }
})();
