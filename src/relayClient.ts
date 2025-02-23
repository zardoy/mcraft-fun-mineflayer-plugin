import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

export interface RelayServerInfo {
    id: string;
    ip: string;
    version: string;
    username: string;
    ping: number;
    viewers: number;
    uptime: number;
}

export class RelayClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private serverId: string | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private connected = false;

    constructor(private relayUrl: string) {
        super();
    }

    connect() {
        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(this.relayUrl);

        this.ws.on('open', () => {
            console.log('Connected to relay server');
            this.connected = true;
            this.emit('connected');

            // If we were previously connected to a server, reconnect
            if (this.serverId) {
                this.connectToServer(this.serverId);
            }
        });

        this.ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'serverList':
                        this.emit('serverList', message.servers as RelayServerInfo[]);
                        break;
                    case 'connected':
                        console.log('Connected to Minecraft server through relay');
                        this.emit('serverConnected', message.serverId);
                        break;
                    case 'serverDisconnected':
                        if (message.serverId === this.serverId) {
                            console.log('Server disconnected from relay');
                            this.serverId = null;
                            this.emit('serverDisconnected');
                        }
                        break;
                    case 'packet':
                        this.emit('packet', message.data);
                        break;
                }
            } catch (error) {
                console.error('Error processing relay message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('Disconnected from relay server');
            this.connected = false;
            this.emit('disconnected');

            // Attempt to reconnect
            if (!this.reconnectTimer) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    this.connect();
                }, 5000);
            }
        });

        this.ws.on('error', (error) => {
            console.error('Relay connection error:', error);
            this.emit('error', error);
        });
    }

    connectToServer(serverId: string) {
        if (!this.connected || !this.ws) {
            throw new Error('Not connected to relay server');
        }

        this.serverId = serverId;
        this.ws.send(JSON.stringify({
            type: 'register',
            role: 'client',
            serverId
        }));
    }

    sendPacket(name: string, params: any) {
        if (!this.connected || !this.ws || !this.serverId) {
            throw new Error('Not connected to server');
        }

        this.ws.send(JSON.stringify({
            type: 'packet',
            data: {
                name,
                params
            }
        }));
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.serverId = null;
        this.connected = false;
    }

    isConnected() {
        return this.connected;
    }

    getCurrentServerId() {
        return this.serverId;
    }
}

export const createRelayClient = (relayUrl: string) => new RelayClient(relayUrl);
