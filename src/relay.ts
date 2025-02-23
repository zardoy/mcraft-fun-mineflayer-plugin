import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

interface RelayServer {
    id: string;
    ip: string;
    version: string;
    username: string;
    ping: number;
    viewers: number;
    uptime: number;
    startTime: number;
    ws: WebSocket;
}

interface RelayClient {
    id: string;
    ws: WebSocket;
    serverId?: string;
}

class RelayManager {
    private wss: WebSocketServer;
    private servers: Map<string, RelayServer> = new Map();
    private clients: Map<string, RelayClient> = new Map();
    private httpServer = createServer();

    constructor(port: number) {
        this.wss = new WebSocketServer({ server: this.httpServer });
        this.setupWebSocketServer();
        this.httpServer.listen(port, () => {
            console.log(`Relay server listening on port ${port}`);
        });

        // Setup REST endpoint for getting connected servers
        this.httpServer.on('request', (req, res) => {
            if (req.url === '/servers' && req.method === 'GET') {
                res.setHeader('Content-Type', 'application/json');
                const serversInfo = Array.from(this.servers.values()).map(server => ({
                    id: server.id,
                    ip: server.ip,
                    version: server.version,
                    username: server.username,
                    ping: server.ping,
                    viewers: server.viewers,
                    uptime: Date.now() - server.startTime
                }));
                res.end(JSON.stringify(serversInfo));
            } else {
                res.statusCode = 404;
                res.end();
            }
        });

        // Update pings periodically
        setInterval(() => this.updatePings(), 5000);
    }

    private setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            const id = Math.random().toString(36).substring(2, 15);

            ws.on('message', (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());

                    if (message.type === 'register') {
                        if (message.role === 'server') {
                            this.handleServerRegistration(id, ws, message, req.socket.remoteAddress || 'unknown');
                        } else if (message.role === 'client') {
                            this.handleClientRegistration(id, ws, message);
                        }
                    } else if (message.type === 'packet') {
                        this.handlePacketRelay(id, message);
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            });

            ws.on('close', () => {
                if (this.servers.has(id)) {
                    const server = this.servers.get(id)!;
                    // Notify all connected clients about server disconnection
                    this.notifyClientsAboutServerDisconnection(server.id);
                    this.servers.delete(id);
                }
                if (this.clients.has(id)) {
                    const client = this.clients.get(id)!;
                    if (client.serverId) {
                        const server = this.servers.get(client.serverId);
                        if (server) {
                            server.viewers--;
                        }
                    }
                    this.clients.delete(id);
                }
            });

            ws.on('pong', () => {
                if (this.servers.has(id)) {
                    const server = this.servers.get(id)!;
                    server.ping = Date.now() - server.startTime;
                }
            });
        });
    }

    private handleServerRegistration(id: string, ws: WebSocket, message: any, ip: string) {
        const server: RelayServer = {
            id,
            ip,
            version: message.version,
            username: message.username,
            ping: 0,
            viewers: 0,
            uptime: 0,
            startTime: Date.now(),
            ws
        };
        this.servers.set(id, server);

        // Send confirmation to server
        ws.send(JSON.stringify({
            type: 'registered',
            id
        }));

        // Broadcast new server to all clients
        this.broadcastServerList();
    }

    private handleClientRegistration(id: string, ws: WebSocket, message: any) {
        const client: RelayClient = {
            id,
            ws,
            serverId: message.serverId
        };
        this.clients.set(id, client);

        if (message.serverId && this.servers.has(message.serverId)) {
            const server = this.servers.get(message.serverId)!;
            server.viewers++;

            // Send confirmation to client
            ws.send(JSON.stringify({
                type: 'connected',
                serverId: message.serverId
            }));
        }
    }

    private handlePacketRelay(senderId: string, message: any) {
        if (this.servers.has(senderId)) {
            // Server is sending packet to its clients
            const server = this.servers.get(senderId)!;
            for (const client of this.clients.values()) {
                if (client.serverId === server.id) {
                    client.ws.send(JSON.stringify({
                        type: 'packet',
                        data: message.data
                    }));
                }
            }
        } else if (this.clients.has(senderId)) {
            // Client is sending packet to its server
            const client = this.clients.get(senderId)!;
            if (client.serverId) {
                const server = this.servers.get(client.serverId);
                if (server) {
                    server.ws.send(JSON.stringify({
                        type: 'packet',
                        data: message.data
                    }));
                }
            }
        }
    }

    private updatePings() {
        for (const server of this.servers.values()) {
            server.ws.ping();
        }
    }

    private broadcastServerList() {
        const serverList = Array.from(this.servers.values()).map(server => ({
            id: server.id,
            ip: server.ip,
            version: server.version,
            username: server.username,
            viewers: server.viewers,
            ping: server.ping,
            uptime: Date.now() - server.startTime
        }));

        for (const client of this.clients.values()) {
            client.ws.send(JSON.stringify({
                type: 'serverList',
                servers: serverList
            }));
        }
    }

    private notifyClientsAboutServerDisconnection(serverId: string) {
        for (const client of this.clients.values()) {
            if (client.serverId === serverId) {
                client.ws.send(JSON.stringify({
                    type: 'serverDisconnected',
                    serverId
                }));
            }
        }
    }
}

export const createRelayServer = (port: number) => new RelayManager(port);
