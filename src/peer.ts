import peerJS, { Peer as PeerType, PeerOptions } from 'peerjs'
import * as wrtc from '@roamhq/wrtc'

const { Peer } = peerJS as unknown as { Peer: typeof PeerType }

export const createPeer = (options: PeerOptions = {}) => {
    // Use wrtc's RTCPeerConnection for Node.js environment
    if (typeof window === 'undefined') {
        options.config = {
            ...options.config,
            RTCPeerConnection: wrtc.RTCPeerConnection
        }
    }

    const peer = new Peer(options)

    peer.on('open', (id) => {
        console.log('My peer ID is: ' + id)
    })

    peer.on('error', (err) => {
        console.error('Peer error:', err)
    })

    peer.on('disconnected', () => {
        console.log('Peer disconnected')
    })

    peer.on('close', () => {
        console.log('Peer connection closed')
    })

    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            console.log('Received', data)
        })
        conn.on('open', () => {
            conn.send({ message: 'hello' })
        })
    })

    return peer
}

// Only create peer if we're running in Node.js
if (typeof window === 'undefined') {
    createPeer()
}
