import { Peer, PeerOptions } from 'peerjs'
import {  } from '@roamhq/wrtc'

export const createPeer = (options: PeerOptions = {}) => {
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
            conn.send({message: 'hello'})
        })
    })

    return peer
}

createPeer()
