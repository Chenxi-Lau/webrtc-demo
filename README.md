# webrtc-demo

> 本项目旨在练习 WebRtc 中相关 APIs 的使用，熟悉 webRtc 的通信流程，并实现一个简单的视频聊天室

```sh
// 安装依赖
npm install

// 访问 localhost:3000
npm run serve
```

最终效果：
![webrtc-demo](https://github.com/Chenxi-Lau/webrtc-demo/blob/main/public/static/images/Webrtc-Demo.gif)

### 相关背景

本示例主要使用了 `WebRTC` 和 `WebSocket`：

- `WebRTC`（Web Real-Time Communication）即网页即时通信，是一个支持网页浏览器进行实时语音对话或视频对话的 API。
- `WebSocket`是一种在单个 TCP 连接上进行全双工通信的协议。在 WebSocket 中，浏览器和服务器只需要完成一次握手，两者之间就直接可以创建持久性的连接，并进行双向数据传输。

### 通话流程

简单说一下流程，如浏览器 A 想和浏览器 B 进行音视频通话：

1.  A、B 都连接信令服务器（websocket 服务）；
2.  A 创建本地视频，并获取会话描述对象（`offer sdp`）信息；
3.  A 将 `offer sdp` 通过 ws 发送给 B；
4.  B 收到信令后，B 创建本地视频，并获取会话描述对象（`answer sdp`）信息；
5.  B 将 `answer sdp` 通过 ws 发送给 A；
6.  A 和 B 开始打洞，收集并通过 ws 交换 ice 信息；
7.  完成打洞后，A 和 B 开始为安全的媒体通信协商秘钥；
8.  至此， A 和 B 可以进行音视频通话。

从上述流程，可以发现**通信双方在建立连接前需要交换信息**，这也就是开头提到的 `WebSocket` 充当的角色：信令服务器，用于转发信息。而 WebRTC **不借助中间媒介** 的意思是，在建立对等连接后，不需要借助第三方服务器中转，而是直接在两个实体（浏览器）间进行传输。

### 具体实现流程

#### 第一步

通信双方首先要连接信令服务器（websocket 服务），同时创建 `RTCPeerConnection` 对象。其中 [RTCPeerConnection]('https://developer.mozilla.org/zh-CN/docs/Web/API/RTCPeerConnection') 的作用是在两个对等端之间建立连接，其构造函数支持传一个配置对象，包含 ICE“打洞”（由于本示例在本机进行测试，故不需要）。

```js
const signalingChannel = new WebSocket('ws://localhost:3000/webrtc');

signalingChannel.onopen = () => {
  // TODO
};
signalingChannel.onmessage = () => {
  // TODO
};
signalingChannel.onerror = () => {
  // TODO
};

const peer = new RTCPeerConnection();
peer.ontrack = () => {
  // TODO
};
peer.onicecandidate = () => {
  // TODO
};
```

#### 第二步

获取本地摄像头/麦克风（需要允许使用权限），拿到本地媒体流（[MediaStream](https://developer.mozilla.org/zh-CN/docs/Web/API/MediaStream)）后，需要将其中所有媒体轨道（[MediaStreamTrack](https://developer.mozilla.org/zh-CN/docs/Web/API/MediaStreamTrack)）添加到轨道集，这些轨道将被发送到另一对等方。

```js
async function getUserMedia(offerSdp) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    createVideo({ id: 'local-video', stream });

    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
  } catch {
    return;
  }
}

// 创建video标签
function createVideo(e) {
  const video = document.createElement('video');
  document.getElementById('video-box').appendChild(video);
  video.id = e.id;
  video.srcObject = e.stream;
  video.autoplay = true;
}
```

#### 第三步

创建发起方会话描述对象（[createOffer](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer)），设置本地 SDP（[setLocalDescription](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setLocalDescription)），并通过信令服务器发送到对等端，以启动与远程对等端的新 WebRTC 连接。

```js
async function createOffer() {
  const offer = await peer.createOffer();
  peer.setLocalDescription(offer);
  signalingChannel.send(JSON.stringify(offer));
}
```

_当调用 setLocalDescription 方法，PeerConnection 开始收集候选人（ice 信息），并发送**offer_ice**到对等方。这边补充第一步中的`peer.onicecandidate`和`socket.onmessage`_

_对等方收到 ice 信息后，通过调用 [addIceCandidate](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate) 将接收的候选者信息传递给浏览器的 ICE 代理。_

```js
peer.onicecandidate = e => {
  if (e.candidate) {
    signalingChannel.send(
      JSON.stringify({
        type: `${target}_ice`,
        iceCandidate: e.candidate
      })
    );
  } else {
    message.log('候选人收集完成！');
  }
};

signalingChannel.onmessage = e => {
  const { type, sdp, iceCandidate } = JSON.parse(e.data);
  if (type === 'offer_ice') {
    peer.addIceCandidate(iceCandidate);
  }
};
```

#### 第四步

接收方（Answer）收到了`offer`信令后，开始获取摄像头/麦克风，与发起方操作一致。同时将收到`offer SDP`指定为连接的远程对等方属性（[setRemoteDescription](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setRemoteDescription)），并创建应答 SDP（[createAnswer](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createAnswer)），发送到对等端。这边补充第一步中的`socket.onmessage`。

```js
signalingChannel.onmessage = e => {
  const { type, sdp, iceCandidate } = JSON.parse(e.data);
  if (type === 'offer') {
    await getUserMedia();
    createAnswer(new RTCSessionDescription({ type, sdp }));
  }
};

async function createAnswer(offerSdp) {
  await peer.setRemoteDescription(offerSdp);

  const answer = await peer.createAnswer();
  peer.setLocalDescription(answer);
  signalingChannel.send(JSON.stringify(answer));
}
```

_注意：当 setLocalDescription 方法调用后，开始收集候选人信息，并发送 **answer_ice** 到对等方。与发送方同理，不赘述。_

#### 第五步

通过不断收集 ICE 信息（[onicecandidate](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidate)），发起方和应答方最终将建立一条最优的连接方式，此时会触发 [ontrack](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/ontrack) 回调，即可获取到对等方的媒体流。

```js
peer.ontrack = e => {
  if (e && e.streams) {
    message.log('收到对方音频/视频流数据...');
    if (!document.querySelector('#remote-video')) {
      createVideo({ id: 'remote-video', stream: e.streams[0] });
    }
  }
};
```

至此，一个完整的视频通话流程就完成。

### References

1. [https://github.com/shushushv/webrtc-p2p](https://github.com/shushushv/webrtc-p2p)
