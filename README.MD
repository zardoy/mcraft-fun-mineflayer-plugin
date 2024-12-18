# Mcraft Fun Mineflayer Plugin

Viewer for Vanilla clients & [mcraft.fun](https://mcraft.fun) ([repo](https://github.com/zardoy/minecraft-web-client)) project.

Usage example:

```ts
import { createBot } from 'mineflayer'
import webConnector from 'mcraft-fun-mineflayer'

const bot = createBot({
    host: 'your-server',
    username: 'test',
})

// load plugin
bot.loadPlugin(webConnector())
```

Web view link will be printed to console.
