let localStream = null;
let peerConnections = {};

async function startVoiceChat() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('voiceChatStatus').innerText = 'Voice Chat: Active (Mic On)';
        document.getElementById('voiceChatStatus').style.color = '#00ff00';

        socket.emit('joinVoice');
    } catch (e) {
        console.error('Microphone access denied or error:', e);
        document.getElementById('voiceChatStatus').innerText = 'Voice Chat: Mic Access Denied';
        document.getElementById('voiceChatStatus').style.color = '#ff0000';
    }
}

function stopVoiceChat() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    for (let id in peerConnections) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    document.getElementById('voiceChatStatus').innerText = 'Connecting Voice Chat...';
    document.getElementById('voiceChatStatus').style.color = '#ffaa00';
}

function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnections[peerId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
        let audio = document.getElementById('audio_' + peerId);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'audio_' + peerId;
            audio.autoplay = true;
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('voiceSignal', { to: peerId, candidate: event.candidate });
        }
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit('voiceSignal', { to: peerId, offer: offer });
        });
    }

    return pc;
}

// Add these to your main socket.on handlers:
socket.on('userJoinedVoice', (peerId) => {
    if (localStream) {
        createPeerConnection(peerId, true);
    }
});

socket.on('voiceSignal', async (data) => {
    const peerId = data.from;

    let pc = peerConnections[peerId];
    if (!pc) {
        pc = createPeerConnection(peerId, false);
    }

    if (data.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voiceSignal', { to: peerId, answer: answer });
    } else if (data.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});
