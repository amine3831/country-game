const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
    cors: { origin: "*" }
});

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("A player connected");

    socket.on("buzz", () => {
        io.emit("buzzed", socket.id);
    });

    socket.on("disconnect", () => {
        console.log("A player disconnected");
    });
});

http.listen(3000, () => {
    console.log("Server running on port 3000");
});
