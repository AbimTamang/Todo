require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors());

// Connection string from .env, or use local fallback
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/todoapp';
const SECRET_KEY = process.env.SECRET_KEY || 'nova_secret_key_123';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB!'))
  .catch((err) => console.error('Error connecting to MongoDB:', err.message));

// =======================
// SCHEMAS & MODELS
// =======================

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String },
  password: { type: String, required: true },
  avatar: { type: String, default: '🐶' }, // Default cartoon avatar
  completedCount: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  datetime: { type: String },
  category: { type: String, default: 'General' }, // Work, Personal, etc.
  recurrence: { type: String, default: 'none' }, // none, daily, weekly
  completed: { type: Boolean, default: false },
  notified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  order: { type: Number, default: 0 }
});

// Send `id` instead of `_id` in JSON responses, so frontend doesn't break!
taskSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  }
});
const Task = mongoose.model('Task', taskSchema);

// =======================
// AUTH MIDDLEWARE
// =======================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user; // { id, username }
    next();
  });
};

// =======================
// ROUTES
// =======================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ error: 'Username or Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id, username: newUser.username }, SECRET_KEY);
    res.json({ token, user: { id: newUser._id, username, email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY);
    res.json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: 'Missing fields' });

    const user = await User.findOne({ email });
    if (!user || !user.email) return res.status(400).json({ error: 'No account found with this valid email' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now login.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({ order: 1, datetime: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description, datetime, category, recurrence } = req.body;
    const taskCount = await Task.countDocuments({ userId: req.user.id });
    const newTask = new Task({
      userId: req.user.id,
      title,
      description,
      datetime,
      category,
      recurrence,
      order: taskCount
    });
    await newTask.save();
    res.json(newTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/reorder', authenticateToken, async (req, res) => {
  try {
    const { taskIds } = req.body;
    const bulkOps = taskIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user.id },
        update: { $set: { order: index } }
      }
    }));
    await Task.bulkWrite(bulkOps);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const updateData = {};
    if (req.body.completed !== undefined) {
      updateData.completed = req.body.completed;
      if (req.body.completed === true) {
        await User.findByIdAndUpdate(req.user.id, { $inc: { completedCount: 1 } });
      }
    }
    if (req.body.notified !== undefined) updateData.notified = req.body.notified;
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.recurrence !== undefined) updateData.recurrence = req.body.recurrence;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updateData },
      { new: true }
    );
    
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
