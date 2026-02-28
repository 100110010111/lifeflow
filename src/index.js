import 'dotenv/config';
import { createApp } from './app.js';

const port = process.env.PORT || 3000;

const app = createApp();
app.listen(port, () => {
  console.log(`LifeFlow Bridge running on port ${port}`);
  console.log(`Dashboard: http://localhost:${port}/${process.env.BRIDGE_SECRET ? '?key=' + process.env.BRIDGE_SECRET : ''}`);
});
