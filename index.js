import express from "express";
import http from "http";
import { WebSocketServer } from "ws"; 
import url from "url";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.get("/", (req, res) => res.send("WebSocket Chat Server is running..."));

const clients = new Map();
const user = new Map();
const groups = new Map();
const groupMessages = new Map();
const privateMessages = new Map();
const privateChats = new Map();

wss.on("connection", (ws, req) => {
  const { query } = url.parse(req.url, true);
  const userId = query.userId;
  console.log("aa", userId);
  clients.set(userId, ws);

  ws.on("message", (data) => {
    try {
      console.log("State snapshot:", {
        clients: Array.from(clients.entries()),
        groups: Array.from(groups.entries()).map(([k, v]) => [
          k,
          Array.from(v),
        ]),
        groupMessages: Array.from(groupMessages.entries()),
        privateMessages: Array.from(privateMessages.entries()),
      });

      const { type, payload } = JSON.parse(data);
      console.log(type, " ", payload);
      switch (type) {
        case "ADD_DIRECT_CHAT": {
          const { username, recipientUsername, tempChatId } = payload;
          privateMessages.set(tempChatId, []);
          privateChats.set(tempChatId, [username, recipientUsername]);
          let sendTo = user.get(recipientUsername);
          const socket = clients.get(sendTo);
          if (socket.readyState == 1) {
            socket.send(
              JSON.stringify({
                type: "ADD_DIRECT_CHAT",
                payload: { id: tempChatId, name: username },
              })
            );
          }
          break;
        }

        case "SEND_MESSAGE": {
          const { chatId, message } = payload;

          if (privateMessages.has(chatId)) {
            privateMessages.get(chatId).push(message);
            console.log(privateChats.get(chatId), "vv");
            let sendKey = privateChats
              .get(chatId)
              .filter((item) => item != message.sender.username);
            console.log(sendKey);
            let sendTo = user.get(sendKey[0]);
            console.log("m", sendTo);
            const socket = clients.get(sendTo);
            console.log(socket.readyState);
            if (socket.readyState === 1) {
              socket.send(
                JSON.stringify({
                  type: "NEW_MESSAGE",
                  payload: { chatId, message },
                })
              );
            }
          } else if (groupMessages.has(chatId)) {
            groupMessages.get(chatId).push(message);

            const group = groups.get(chatId);
            console.log(groups.get(chatId));
            if (group) {
              let members = group.totalmembers.filter(
                (mem) => mem != payload.message.sender.username
              );
              console.log("ww", members);
              members.forEach((memberId) => {
                let sendTo = user.get(memberId);
                const memberSocket = clients.get(sendTo);
                console.log(memberId, memberSocket);
                if (memberSocket && memberSocket.readyState === 1) {
                  memberSocket.send(
                    JSON.stringify({
                      type: "NEW_MESSAGE",
                      payload: { chatId, message },
                    })
                  );
                }
              });
            }
          }

          break;
        }

        case "ADD_GROUP_CHAT": {
          const { createdBy, username, name, members, tempGroupId } = payload;
          console.log("gg", createdBy, username, name, members, tempGroupId);
          let totalmembers = [...members, username];
          groups.set(tempGroupId, { name, createdBy, totalmembers });
          groupMessages.set(tempGroupId, []);
          console.log("mmm", members);
          members.forEach((mem) => {
            console.log(mem);
            let userId = user.get(mem);
            let socket = clients.get(userId);
            if (socket.readyState === 1) {
              socket.send(
                JSON.stringify({
                  type: "ADD_GROUP_CHAT",
                  payload: { id: tempGroupId, name: name },
                })
              );
            }
          });

          break;
        }

        case "FETCH_INITIAL_DATA": {
          const { userId, username } = payload;
          console.log(userId, username, "bb");
          user.set(username, userId);
          const userChats = [];
          for (const [chatId, msgs] of privateMessages.entries()) {
            userChats.push({ chatId, messages: msgs });
          }

          for (const [groupId, msgs] of groupMessages.entries()) {
            const group = groups.get(groupId);
            if (group?.members.includes(userId)) {
              userChats.push({ chatId: groupId, messages: msgs });
            }
          }

          ws.send(
            JSON.stringify({
              type: "INITIAL_DATA",
              payload: { chats: userChats },
            })
          );

          break;
        }

        default:
          console.log("Unknown type received:", type);
      }
    } catch (err) {
      console.error("Failed to handle message:", err);
    }
  });

  ws.on("close", () => {
    clients.delete(userId);
  });
});

const PORT = 8000;
server.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
