// @ts-ignore
import indexHTML from "./public/index.html"
import { 
    WebSocket,
    WebSocketPair,
    Request, 
    Response,
    KVNamespace,
} from "@cloudflare/workers-types";

export { CoordinatorDurableObject } from "./durable-object"

interface User {
	websocket: WebSocket;
	id: string;

    // all the media stream tracks this user publishing
    tracks: string[];
}

namespace Message {
    export type PublichTrack = {
        type: 'publish-track';
        data: {
            trackId: string;
        }
    }
}

type Environment = {
    ROOMSKV: KVNamespace
}

async function websocketHandler(request: Request, env: Environment): Promise<Response> {
    const requestMetadata = request.cf;

    // To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
    // i.e. two WebSockets that talk to each other), we return one end of the pair in the
    // response, and we operate on the other end. Note that this API is not part of the
    // Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
    // any way to act as a WebSocket server today.
    let pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // We're going to take pair[1] as our end, and return pair[0] to the client.
    await handleWebSocketSession(server, requestMetadata, env);

    // Now we return the other end of the pair to the client.
    return new Response(null, { status: 101, webSocket: client });
}

async function handleWebSocketSession(webSocket: WebSocket, metadata: any, env: Environment) {
    // Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
    // WebSocket in JavaScript, not sending it elsewhere.
    webSocket.accept();

    // Create our session and add it to the users map.
    const userId = crypto.randomUUID();

    await env.ROOMSKV.put(userId, JSON.stringify({
        id: userId,
        websocket: webSocket,
        tracks: [],
    }))

    console.log('user joined', userId)

    webSocket.addEventListener('message', async msg => {
        try {
            console.log("received", msg)

            /*
            // Parse the incoming message
            let incomingMessage = JSON.parse(msg.data) as Message.Ping;

            switch (incomingMessage.type) {
                case 'ping':
                    const msg: Message.Pong = {
                        type: 'pong',
                        data: {
                            id: incomingMessage.data.id,
                            time: Date.now(),
                            dolocation: this.dolocation,
                            users: Array.from(this.users.values()).map(x => {
                                // update user's ping
                                if (incomingMessage.data.lastPingMs && x.websocket === webSocket) {
                                    this.pings.set(x.id, incomingMessage.data.lastPingMs);
                                }

                                return {
                                    ...x,
                                    ping: this.pings.get(x.id),
                                    websocket: undefined,
                                };
                            }),
                        },
                    };
                    webSocket.send(JSON.stringify([msg]));
                    break;
            }
            
            */
        } catch (err) {
            // Report any exceptions directly back to the client. As with our handleErrors() this
            // probably isn't what you'd want to do in production, but it's convenient when testing.
            webSocket.send(JSON.stringify({ error: err.stack }));
        }
    });

    // On "close" and "error" events, remove the WebSocket from the webSockets list
    let closeOrErrorHandler = () => {
        console.log('user', userId);
        this.users.delete(userId);
    };

    webSocket.addEventListener('close', closeOrErrorHandler);
    webSocket.addEventListener('error', closeOrErrorHandler);
}

interface JoinTrack {
    trackId: string;
    sessionId: string;
    roomId: string;
}

interface Track {
    sessionId: string;
    trackId: string;
}

export default {
    async fetch(request: Request, env: Environment): Promise<Response> {
        const url = new URL(request.url)

        if (url.pathname === '/join') {
            const body = await request.json<JoinTrack>()
            let roomTracks = await env.ROOMSKV.get<Track[]>(body.roomId)

            if (roomTracks?.length === 0) {
                roomTracks = []
            }
            roomTracks?.push({ sessionId: body.sessionId, trackId: body.trackId })

            let res = JSON.stringify(roomTracks)
            await env.ROOMSKV.put(body.roomId, res)

            return new Response(res, {
                headers: { 'content-type': 'application/json' },
            })
        }

        if (url.pathname === '/leave') {

        }

		// pass the request to Durable Object for any WebSocket connection
        /* 
		if (request.headers.get('upgrade') === 'websocket') {
            return await websocketHandler(request, env)
		}
        */
    
        return new Response(indexHTML, {
            headers: { 'content-type': 'text/html' },
        })
    },
};