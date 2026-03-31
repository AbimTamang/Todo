import { useState, useEffect } from 'react';
import './index.css';
import useSound from 'use-sound';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// --- Sortable Item Component ---
function SortableTaskItem({ task, toggleComplete, deleteTask, formatDateTime, isExpired }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`task-item ${task.completed ? 'completed' : ''} ${isExpired(task) ? 'expired' : ''}`}
    >
      <div className="drag-handle" {...attributes} {...listeners}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>

      <div className="checkbox-wrapper">
        <input 
          type="checkbox" 
          className="custom-checkbox"
          checked={task.completed} 
          onChange={() => toggleComplete(task.id)} 
        />
      </div>
      
      <div className="task-content">
        <div className={`category-badge cat-${task.category?.toLowerCase() || 'general'}`}>
          {task.category || 'General'}
        </div>
        <h3 className="task-title">{task.title}</h3>
        {task.description && <p className="task-desc">{task.description}</p>}
        
        <div className="task-meta">
          {task.datetime && (
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <circle cx="12" cy="12" r="10"></circle>
                 <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              {formatDateTime(task.datetime)} {isExpired(task) && '(Overdue)'}
            </span>
          )}
          {task.recurrence !== 'none' && (
            <span style={{marginLeft: '8px', color: 'var(--accent-primary)'}}>
              🔄 {task.recurrence}
            </span>
          )}
        </div>
      </div>

      <div className="task-actions">
        <button className="icon-btn delete" onClick={() => deleteTask(task.id)} title="Delete task">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') === 'dark');

  // Auth form state
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authError, setAuthError] = useState('');
  const [isForgotView, setIsForgotView] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');

  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);
  
  // New task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [datetime, setDatetime] = useState('');
  const [category, setCategory] = useState('General');
  const [recurrence, setRecurrence] = useState('none');

  // Sounds
  const [playPop] = useSound('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', { volume: 0.5 });
  const [playDing] = useSound('/Your phone linging - Chinese meme song #song #chinese #phone - VectorOhYeah (128k).mp3', { volume: 0.8 });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    document.body.className = isDarkMode ? 'dark' : '';
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Fetch tasks
  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setTasks(data))
      .catch(err => console.error(err));
    }
  }, [token]);

  const requestPermission = async () => {
    const perm = await Notification.requestPermission();
    setNotificationPermission(perm);
  };

  useEffect(() => {
    if (Notification.permission === 'default') requestPermission();
  }, []);

  // Notifications
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      let updated = false;
      const newTasks = tasks.map(task => {
        if (!task.completed && !task.notified && task.datetime) {
          const taskTime = new Date(task.datetime).getTime();
          console.log(`Checking task: ${task.title}, Current: ${now}, Target: ${taskTime}, Diff: ${now - taskTime}`);
          if (now >= taskTime && now - taskTime < 3600000) {
            console.log("Triggering notification alert with 6s sound for:", task.title);
            
            // Play meme song for exactly 6 seconds
            const alertAudio = new Audio('/Your phone linging - Chinese meme song #song #chinese #phone - VectorOhYeah (128k).mp3');
            alertAudio.play().then(() => {
              setTimeout(() => {
                alertAudio.pause();
                alertAudio.currentTime = 0; // Reset to start
              }, 6000);
            }).catch(e => console.log("Sound blocked by browser:", e));
            
            new Notification('Task Reminder: ' + task.title, {
              body: task.description || 'Time to get to work!',
              icon: '/vite.svg'
            });
            fetch(`${API_URL}/tasks/${task.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ notified: true })
            });
            updated = true;
            return { ...task, notified: true };
          }
        }
        return task;
      });
      if (updated) setTasks(newTasks);
    }, 10000);
    return () => clearInterval(interval);
  }, [tasks, token, playDing]);

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isLoginView ? '/auth/login' : '/auth/register';
    const payload = isLoginView ? { username: authUsername, password: authPassword } : { username: authUsername, email: authEmail, password: authPassword };
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return setAuthError(data.error);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail, newPassword: authPassword })
    });
    const data = await res.json();
    if (!res.ok) return setAuthError(data.error);
    setForgotSuccess(data.message);
    setTimeout(() => setIsForgotView(false), 3000);
  };

  const addTask = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, description, datetime, category, recurrence })
    });
    const newTask = await res.json();
    setTasks([...tasks, newTask]);
    setTitle(''); setDatetime('');
  };

  const toggleComplete = async (id) => {
    const task = tasks.find(t => t.id === id);
    const res = await fetch(`${API_URL}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ completed: !task.completed })
    });
    if (res.ok) {
      if (!task.completed) playPop();
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    }
  };

  const deleteTask = async (id) => {
    const res = await fetch(`${API_URL}/tasks/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setTasks(tasks.filter(t => t.id !== id));
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      const newArray = arrayMove(tasks, oldIndex, newIndex);
      setTasks(newArray);
      fetch(`${API_URL}/tasks/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taskIds: newArray.map(t => t.id) })
      });
    }
  };

  const getFilteredTasks = () => {
    if (filter === 'completed') return tasks.filter(t => t.completed);
    if (filter === 'upcoming') return tasks.filter(t => !t.completed);
    return tasks;
  };

  return (
    <div className="app-container">
      <button className="theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>
        {isDarkMode ? '🌞' : '🌙'}
      </button>

      {!token ? (
        <div style={{ maxWidth: '400px', margin: '10vh auto' }}>
          <header><h1>Nova</h1></header>
          <section className="glass-panel">
            {isForgotView ? (
              <form onSubmit={handleForgot} className="form-group">
                <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required />
                <input type="password" placeholder="New Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
                <button type="submit" style={{width:'100%'}}>Reset</button>
                <button type="button" onClick={()=>setIsForgotView(false)} style={{background:'none', border:'none', color:'var(--text-muted)'}}>Back</button>
              </form>
            ) : (
              <form onSubmit={handleAuth} className="form-group">
                <input type="text" placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required />
                {!isLoginView && <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required />}
                <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
                <button type="submit" style={{width:'100%'}}>{isLoginView ? 'Login' : 'Signup'}</button>
                <button type="button" onClick={()=>setIsLoginView(!isLoginView)} style={{background:'none', border:'none', color:'var(--text-muted)'}}>
                  {isLoginView ? 'Need account?' : 'Have account?'}
                </button>
                {isLoginView && <button type="button" onClick={()=>setIsForgotView(true)} style={{background:'none', border:'none', color:'var(--accent-secondary)'}}>Forgot?</button>}
              </form>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="user-profile-header">
            <div className="avatar-circle">{user?.avatar || '🐶'}</div>
            <div>
              <h2 style={{margin:0}}>Hey, {user?.username}!</h2>
              <div className="stats-container">
                <span className="stat-item">Done: <span className="stat-value">{user?.completedCount || 0}</span></span>
              </div>
            </div>
            <button onClick={() => {localStorage.removeItem('token'); setToken(null);}} style={{marginLeft:'auto', background:'var(--accent-danger)'}}>Exit</button>
          </div>

          <section className="glass-panel">
            <form onSubmit={addTask} className="form-group">
              <div className="input-row">
                <input type="text" placeholder="Task..." value={title} onChange={e => setTitle(e.target.value)} required />
                <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} required />
              </div>
              <div className="input-row">
                <select value={category} onChange={e => setCategory(e.target.value)} style={{flex:1, padding:'1rem', border:'3px solid var(--border-color)', borderRadius:'12px', background:'white'}}>
                  <option>General</option><option>Work</option><option>Personal</option><option>Health</option><option>Urgent</option>
                </select>
                <select value={recurrence} onChange={e => setRecurrence(e.target.value)} style={{flex:1, padding:'1rem', border:'3px solid var(--border-color)', borderRadius:'12px', background:'white'}}>
                  <option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
                </select>
              </div>
              <button type="submit">Add Task</button>
            </form>
          </section>

          <div className="filters glass-panel" style={{padding:'1rem'}}>
            <button className={`filter-btn ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>All</button>
            <button className={`filter-btn ${filter==='upcoming'?'active':''}`} onClick={()=>setFilter('upcoming')}>Pending</button>
            <button className={`filter-btn ${filter==='completed'?'active':''}`} onClick={()=>setFilter('completed')}>Done</button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={getFilteredTasks().map(t=>t.id)} strategy={verticalListSortingStrategy}>
              <div className="task-list">
                {getFilteredTasks().map(task => (
                  <SortableTaskItem 
                    key={task.id} 
                    task={task} 
                    toggleComplete={toggleComplete} 
                    deleteTask={deleteTask}
                    isExpired={(t)=>t.datetime && new Date(t.datetime) < new Date() && !t.completed}
                    formatDateTime={(d)=>new Date(d).toLocaleString()}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}

export default App;
