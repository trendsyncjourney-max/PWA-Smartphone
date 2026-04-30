const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

// Capture last git commit date at startup
let APP_LAST_MODIFIED = 'Unknown';
try {
  APP_LAST_MODIFIED = execSync('git log -1 --format="%cd" --date=format:"%Y-%m-%d"', { cwd: __dirname }).toString().trim();
} catch (e) { /* not a git repo or git not available */ }

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'trendsyncjourney@gmail.com';

const emailTransporter = (process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

async function sendAdminEmail(subject, body) {
  if (!emailTransporter) {
    console.log(`[EMAIL - not configured] To: ${ADMIN_EMAIL}\nSubject: ${subject}\n${body}`);
    return;
  }
  try {
    await emailTransporter.sendMail({
      from: process.env.SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `[Cargo Audit] ${subject}`,
      text: body
    });
    console.log(`Email sent to ${ADMIN_EMAIL}: ${subject}`);
  } catch (err) {
    console.error('Email send error:', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barcode-audit-secret-key-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const dbPath = process.env.RENDER_DISK_PATH
  ? path.join(process.env.RENDER_DISK_PATH, 'audit.db')
  : path.join(__dirname, 'database', 'audit.db');
const dbDir = path.dirname(dbPath);
const backupDir = path.join(dbDir, 'backups');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

// ==================== ROLLING BACKUP SYSTEM ====================
const MAX_BACKUPS = 7;

function createBackup() {
  try {
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const dest = path.join(backupDir, `audit_${ts}.db`);
    fs.copyFileSync(dbPath, dest);

    // Prune: keep only latest MAX_BACKUPS
    const all = fs.readdirSync(backupDir).filter(f => /^audit_[\d_-]+\.db$/.test(f)).sort();
    if (all.length > MAX_BACKUPS) {
      all.slice(0, all.length - MAX_BACKUPS).forEach(f => {
        try { fs.unlinkSync(path.join(backupDir, f)); } catch (e) {}
      });
    }
    console.log(`[backup] Created ${path.basename(dest)} (${all.length > MAX_BACKUPS ? MAX_BACKUPS : all.length} kept)`);
  } catch (err) {
    console.error('[backup] Failed:', err.message);
  }
}

// Debounce: create one backup after 8s of write inactivity
let backupTimer = null;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(createBackup, 8000);
}

// Auto-trigger on any successful write to the API
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.path.startsWith('/api/') && !req.path.startsWith('/api/backups')) {
    res.on('finish', () => { if (res.statusCode < 400) scheduleBackup(); });
  }
  next();
});

// Initialize database tables
db.serialize(() => {
  // Stations Table
  db.run(`CREATE TABLE IF NOT EXISTS stations (
    station_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    barcode TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Items Table
  db.run(`CREATE TABLE IF NOT EXISTS items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    version TEXT,
    effective_date DATE,
    expiry_date DATE,
    barcode TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Audit Table
  db.run(`CREATE TABLE IF NOT EXISTS audits (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status TEXT DEFAULT 'in_progress',
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
  )`);

  // Audit Details Table
  db.run(`CREATE TABLE IF NOT EXISTS audit_details (
    detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    scan_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK(status IN ('Found', 'Missing', 'Misplaced')),
    notes TEXT,
    FOREIGN KEY (audit_id) REFERENCES audits(audit_id),
    FOREIGN KEY (item_id) REFERENCES items(item_id)
  )`);

  // Items Distribution Table
  db.run(`CREATE TABLE IF NOT EXISTS items_distribution (
    distribution_id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    station_id INTEGER NOT NULL,
    version TEXT,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
  )`);

  // Users Table (for admin/login)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (!err) {
      // Create default admin user
      const defaultPassword = bcrypt.hashSync('admin123', 10);
      db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
        ['admin', defaultPassword, 'admin']);
    }
  });

  // Issue Reports Table
  db.run(`CREATE TABLE IF NOT EXISTS issue_reports (
    report_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  )`);

  // Settings Table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Sub-locations Table
  db.run(`CREATE TABLE IF NOT EXISTS sub_locations (
    sub_location_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    station_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
  )`);

  // Schema migrations for existing tables
  db.run('ALTER TABLE items_distribution ADD COLUMN sub_location_id INTEGER', () => {});
  db.run('ALTER TABLE audit_details ADD COLUMN condition TEXT', () => {});
  db.run('ALTER TABLE audit_details ADD COLUMN sub_location_id INTEGER', () => {});
  db.run('ALTER TABLE audit_details ADD COLUMN action TEXT', () => {});
  db.run('ALTER TABLE items_distribution ADD COLUMN remarks TEXT', () => {});
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    bcrypt.compare(password, user.password, (err, valid) => {
      if (err || !valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { user_id: user.user_id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          role: user.role
        }
      });
    });
  });
});

// Change own password
app.put('/api/auth/change-password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  db.get('SELECT * FROM users WHERE user_id = ?', [req.user.user_id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    bcrypt.compare(current_password, user.password, (err, valid) => {
      if (err || !valid) return res.status(401).json({ error: 'Current password is incorrect' });
      const hashed = bcrypt.hashSync(new_password, 10);
      db.run('UPDATE users SET password = ? WHERE user_id = ?', [hashed, req.user.user_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// ==================== STATIONS ROUTES ====================

// Get all stations
app.get('/api/stations', authenticateToken, (req, res) => {
  db.all('SELECT * FROM stations ORDER BY name', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get station by barcode
app.get('/api/stations/barcode/:barcode', authenticateToken, (req, res) => {
  db.get('SELECT * FROM stations WHERE barcode = ?', [req.params.barcode], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json(row);
  });
});

// Create station (admin only)
app.post('/api/stations', authenticateToken, requireAdmin, (req, res) => {
  const { name, location, barcode } = req.body;

  db.run(
    'INSERT INTO stations (name, location, barcode) VALUES (?, ?, ?)',
    [name, location, barcode],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ station_id: this.lastID, name, location, barcode });
    }
  );
});

// Update station (admin only)
app.put('/api/stations/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, location, barcode } = req.body;

  db.run(
    'UPDATE stations SET name = ?, location = ?, barcode = ? WHERE station_id = ?',
    [name, location, barcode, req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ updated: this.changes });
    }
  );
});

// Delete station (admin only)
app.delete('/api/stations/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('DELETE FROM stations WHERE station_id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ deleted: this.changes });
  });
});

// ==================== SUB-LOCATIONS ROUTES ====================

app.get('/api/sub-locations', authenticateToken, (req, res) => {
  const q = `SELECT sl.*, s.name as station_name FROM sub_locations sl JOIN stations s ON sl.station_id = s.station_id ORDER BY s.name, sl.name`;
  db.all(q, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/sub-locations/station/:stationId', authenticateToken, (req, res) => {
  db.all('SELECT * FROM sub_locations WHERE station_id = ? ORDER BY name', [req.params.stationId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/sub-locations', authenticateToken, requireAdmin, (req, res) => {
  const { name, station_id } = req.body;
  if (!name || !station_id) return res.status(400).json({ error: 'Name and station required' });
  db.run('INSERT INTO sub_locations (name, station_id) VALUES (?, ?)', [name, station_id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ sub_location_id: this.lastID, name, station_id });
  });
});

app.delete('/api/sub-locations/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('DELETE FROM sub_locations WHERE sub_location_id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ==================== ITEMS ROUTES ====================

// Get items grouped by name (for distribution version dropdown)
app.get('/api/items/grouped', authenticateToken, (req, res) => {
  db.all('SELECT * FROM items ORDER BY item_name, version', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const grouped = {};
    rows.forEach(item => {
      if (!grouped[item.item_name]) grouped[item.item_name] = [];
      grouped[item.item_name].push(item);
    });
    const result = Object.entries(grouped).map(([name, versions]) => ({ name, versions }));
    res.json(result);
  });
});

// Get all items
app.get('/api/items', authenticateToken, (req, res) => {
  db.all('SELECT * FROM items ORDER BY item_name', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get item by barcode
app.get('/api/items/barcode/:barcode', authenticateToken, (req, res) => {
  db.get('SELECT * FROM items WHERE barcode = ?', [req.params.barcode], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(row);
  });
});

// Create item (admin only)
app.post('/api/items', authenticateToken, requireAdmin, (req, res) => {
  const { item_name, version, effective_date, expiry_date, barcode } = req.body;

  console.log('Creating item:', { item_name, version, effective_date, expiry_date, barcode });

  db.run(
    'INSERT INTO items (item_name, version, effective_date, expiry_date, barcode) VALUES (?, ?, ?, ?, ?)',
    [item_name, version, effective_date || null, expiry_date || null, barcode || null],
    function(err) {
      if (err) {
        console.error('Database error creating item:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log('Item created with ID:', this.lastID);
      res.json({ item_id: this.lastID, item_name, version, barcode });
    }
  );
});

// Update item (admin only)
app.put('/api/items/:id', authenticateToken, requireAdmin, (req, res) => {
  const { item_name, version, effective_date, expiry_date, barcode } = req.body;

  db.run(
    'UPDATE items SET item_name = ?, version = ?, effective_date = ?, expiry_date = ?, barcode = ? WHERE item_id = ?',
    [item_name, version, effective_date, expiry_date, barcode, req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ updated: this.changes });
    }
  );
});

// Delete item (admin only)
app.delete('/api/items/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('DELETE FROM items WHERE item_id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ deleted: this.changes });
  });
});

// ==================== ITEMS DISTRIBUTION ROUTES ====================

// Get items distribution
app.get('/api/distribution', authenticateToken, (req, res) => {
  const query = `
    SELECT d.*, s.name as station_name, i.item_name as item_name_full, sl.name as sub_location_name
    FROM items_distribution d
    JOIN stations s ON d.station_id = s.station_id
    JOIN items i ON d.item_id = i.item_id
    LEFT JOIN sub_locations sl ON d.sub_location_id = sl.sub_location_id
    ORDER BY s.name, d.item_name
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get items for a specific station
app.get('/api/distribution/station/:stationId', authenticateToken, (req, res) => {
  const query = `
    SELECT d.*, i.barcode, i.effective_date, i.expiry_date, sl.name as sub_location_name
    FROM items_distribution d
    JOIN items i ON d.item_id = i.item_id
    LEFT JOIN sub_locations sl ON d.sub_location_id = sl.sub_location_id
    WHERE d.station_id = ?
    ORDER BY COALESCE(sl.name, 'zzz'), d.item_name
  `;
  db.all(query, [req.params.stationId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Create distribution entry (admin only)
app.post('/api/distribution', authenticateToken, requireAdmin, (req, res) => {
  const { item_id, item_name, station_id, version, sub_location_id, remarks } = req.body;
  const subLocId = sub_location_id || null;

  db.get(
    'SELECT distribution_id FROM items_distribution WHERE item_id = ? AND station_id = ? AND COALESCE(sub_location_id, 0) = COALESCE(?, 0)',
    [item_id, station_id, subLocId],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) return res.status(400).json({ error: 'Item is already assigned to this station/sub-location' });

      db.run(
        'INSERT INTO items_distribution (item_id, item_name, station_id, version, sub_location_id, remarks) VALUES (?, ?, ?, ?, ?, ?)',
        [item_id, item_name, station_id, version, subLocId, remarks || null],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ distribution_id: this.lastID });
        }
      );
    }
  );
});

// Delete distribution entry (admin only)
app.delete('/api/distribution/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('DELETE FROM items_distribution WHERE distribution_id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ deleted: this.changes });
  });
});

// ==================== AUDIT ROUTES ====================

// Start new audit
app.post('/api/audits', authenticateToken, (req, res) => {
  const { station_id, start_time } = req.body;
  const user_id = req.user.user_id;

  // Check if there's an existing incomplete audit for this station
  db.get(
    'SELECT * FROM audits WHERE station_id = ? AND status = "in_progress"',
    [station_id],
    (err, existingAudit) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (existingAudit) {
        return res.status(400).json({ error: 'An audit is already in progress for this station' });
      }

      const ts = start_time || new Date().toISOString();
      db.run(
        'INSERT INTO audits (station_id, user_id, status, start_time) VALUES (?, ?, "in_progress", ?)',
        [station_id, user_id, ts],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ audit_id: this.lastID, station_id, user_id, status: 'in_progress', start_time: ts });
        }
      );
    }
  );
});

// Get current/active audits
app.get('/api/audits/active', authenticateToken, (req, res) => {
  const query = `
    SELECT a.*, s.name as station_name, s.location
    FROM audits a
    JOIN stations s ON a.station_id = s.station_id
    WHERE a.status = 'in_progress'
    ORDER BY a.start_time DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get audit by ID with details
app.get('/api/audits/:id', authenticateToken, (req, res) => {
  const auditQuery = `
    SELECT a.*, s.name as station_name, s.location
    FROM audits a
    JOIN stations s ON a.station_id = s.station_id
    WHERE a.audit_id = ?
  `;

  db.get(auditQuery, [req.params.id], (err, audit) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    const detailsQuery = `
      SELECT ad.*, i.item_name, i.barcode, sl.name as sub_location_name
      FROM audit_details ad
      JOIN items i ON ad.item_id = i.item_id
      LEFT JOIN sub_locations sl ON ad.sub_location_id = sl.sub_location_id
      WHERE ad.audit_id = ?
      ORDER BY ad.scan_time DESC
    `;

    db.all(detailsQuery, [req.params.id], (err, details) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      audit.details = details;
      res.json(audit);
    });
  });
});

// Get all audits (with pagination)
app.get('/api/audits', authenticateToken, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const query = `
    SELECT a.*, s.name as station_name, s.location
    FROM audits a
    JOIN stations s ON a.station_id = s.station_id
    ORDER BY a.start_time DESC
    LIMIT ? OFFSET ?
  `;

  db.all(query, [parseInt(limit), parseInt(offset)], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add audit detail (scan item)
app.post('/api/audits/:id/details', authenticateToken, (req, res) => {
  const { item_id, status, notes, condition, sub_location_id, action, scan_time } = req.body;
  const audit_id = req.params.id;
  const subLocId = sub_location_id || null;
  const ts = scan_time || new Date().toISOString();

  db.get('SELECT * FROM audits WHERE audit_id = ? AND status = "in_progress"', [audit_id], (err, audit) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!audit) return res.status(400).json({ error: 'Audit is not in progress' });

    db.get(
      'SELECT * FROM audit_details WHERE audit_id = ? AND item_id = ? AND COALESCE(sub_location_id, 0) = COALESCE(?, 0)',
      [audit_id, item_id, subLocId],
      (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) {
          db.run(
            'UPDATE audit_details SET status = ?, notes = ?, condition = ?, action = ?, scan_time = ? WHERE detail_id = ?',
            [status, notes, condition || null, action || null, ts, existing.detail_id],
            function(err) {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ detail_id: existing.detail_id, updated: true });
            }
          );
        } else {
          db.run(
            'INSERT INTO audit_details (audit_id, item_id, status, notes, condition, sub_location_id, action, scan_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [audit_id, item_id, status, notes, condition || null, subLocId, action || null, ts],
            function(err) {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ detail_id: this.lastID, updated: false });
            }
          );
        }
      }
    );
  });
});

// Finish audit
app.put('/api/audits/:id/finish', authenticateToken, (req, res) => {
  const ts = (req.body && req.body.end_time) || new Date().toISOString();
  db.run(
    'UPDATE audits SET end_time = ?, status = "completed" WHERE audit_id = ? AND status = "in_progress"',
    [ts, req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(400).json({ error: 'Audit not found or already completed' });
      }
      res.json({ finished: true });
    }
  );
});

// Delete audit (admin only — in_progress only)
app.delete('/api/audits/:id', authenticateToken, requireAdmin, (req, res) => {
  db.get('SELECT status FROM audits WHERE audit_id = ?', [req.params.id], (err, audit) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    if (audit.status !== 'in_progress') return res.status(400).json({ error: 'Only in-progress audits can be deleted' });
    db.serialize(() => {
      db.run('DELETE FROM audit_details WHERE audit_id = ?', [req.params.id]);
      db.run('DELETE FROM audits WHERE audit_id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
      });
    });
  });
});

// Get all audits for a station (admin query page)
app.get('/api/audits/by-station/:stationId', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT a.audit_id, a.status, a.start_time, a.end_time,
      u.username as auditor,
      COUNT(CASE WHEN ad.status = 'Found' THEN 1 END) as found_count,
      COUNT(CASE WHEN ad.status = 'Missing' THEN 1 END) as missing_count,
      COUNT(CASE WHEN ad.status = 'Misplaced' THEN 1 END) as misplaced_count
    FROM audits a
    JOIN users u ON a.user_id = u.user_id
    LEFT JOIN audit_details ad ON a.audit_id = ad.audit_id
    WHERE a.station_id = ?
    GROUP BY a.audit_id
    ORDER BY a.start_time DESC
  `;
  db.all(query, [req.params.stationId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ==================== REPORTS ROUTES ====================

// Get audit report
app.get('/api/reports/audits/:id', authenticateToken, (req, res) => {
  const auditId = req.params.id;

  const query = `
    SELECT
      a.audit_id,
      a.station_id,
      a.start_time,
      a.end_time,
      a.status,
      s.name as station_name,
      s.location,
      u.username as auditor,
      COUNT(CASE WHEN ad.status = 'Found' THEN 1 END) as found_count,
      COUNT(CASE WHEN ad.status = 'Missing' THEN 1 END) as missing_count,
      COUNT(CASE WHEN ad.status = 'Misplaced' THEN 1 END) as misplaced_count,
      COUNT(ad.detail_id) as total_scanned
    FROM audits a
    JOIN stations s ON a.station_id = s.station_id
    JOIN users u ON a.user_id = u.user_id
    LEFT JOIN audit_details ad ON a.audit_id = ad.audit_id
    WHERE a.audit_id = ?
    GROUP BY a.audit_id
  `;

  db.get(query, [auditId], (err, report) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!report) return res.status(404).json({ error: 'Audit not found' });

    const itemsQuery = `
      SELECT ad.*, i.item_name, i.barcode, i.version as item_version,
        COALESCE(d.version, i.version) as version,
        sl.name as sub_location_name
      FROM audit_details ad
      JOIN items i ON ad.item_id = i.item_id
      LEFT JOIN items_distribution d ON d.item_id = ad.item_id
        AND d.station_id = ?
        AND COALESCE(d.sub_location_id, 0) = COALESCE(ad.sub_location_id, 0)
      LEFT JOIN sub_locations sl ON ad.sub_location_id = sl.sub_location_id
      WHERE ad.audit_id = ?
      ORDER BY CASE WHEN sl.name IS NULL THEN 1 ELSE 0 END, sl.name, i.item_name
    `;

    db.all(itemsQuery, [report.station_id, auditId], (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      report.items = items;
      res.json(report);
    });
  });
});

// Get summary report
app.get('/api/reports/summary', authenticateToken, (req, res) => {
  const { start_date, end_date } = req.query;

  let dateFilter = '';
  const params = [];

  if (start_date && end_date) {
    dateFilter = 'WHERE a.start_time BETWEEN ? AND ?';
    params.push(start_date, end_date + ' 23:59:59');
  }

  const query = `
    SELECT
      s.name as station_name,
      COUNT(a.audit_id) as total_audits,
      SUM(CASE WHEN ad.status = 'Found' THEN 1 ELSE 0 END) as total_found,
      SUM(CASE WHEN ad.status = 'Missing' THEN 1 ELSE 0 END) as total_missing,
      SUM(CASE WHEN ad.status = 'Misplaced' THEN 1 ELSE 0 END) as total_misplaced
    FROM stations s
    LEFT JOIN audits a ON s.station_id = a.station_id ${dateFilter.replace('a.', 'a.')}
    LEFT JOIN audit_details ad ON a.audit_id = ad.audit_id
    GROUP BY s.station_id
    ORDER BY s.name
  `;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ==================== ADMIN ROUTES ====================

// Get all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT user_id, username, role, created_at FROM users ORDER BY username', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Create user (admin only)
app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, role = 'user' } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, hashedPassword, role],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ user_id: this.lastID, username, role });
    }
  );
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('DELETE FROM users WHERE user_id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ deleted: this.changes });
  });
});

// ==================== ISSUE REPORTS ROUTES ====================

// Submit issue report
app.post('/api/reports/issues', authenticateToken, (req, res) => {
  const { title, description, category = 'general' } = req.body;
  const user_id = req.user.user_id;

  db.run(
    'INSERT INTO issue_reports (user_id, title, description, category) VALUES (?, ?, ?, ?)',
    [user_id, title, description, category],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      sendAdminEmail(title, description);
      res.json({ report_id: this.lastID, title, status: 'open' });
    }
  );
});

// Get all issue reports (admin only)
app.get('/api/reports/issues', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT ir.*, u.username
    FROM issue_reports ir
    JOIN users u ON ir.user_id = u.user_id
    ORDER BY ir.created_at DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Update issue status (admin only)
app.put('/api/reports/issues/:id', authenticateToken, requireAdmin, (req, res) => {
  const { status } = req.body;
  const resolved_at = status === 'resolved' ? new Date().toISOString() : null;

  db.run(
    'UPDATE issue_reports SET status = ?, resolved_at = ? WHERE report_id = ?',
    [status, resolved_at, req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ updated: this.changes });
    }
  );
});

// ==================== ADMIN REPORTS BY DATE ====================

app.get('/api/reports/by-date', authenticateToken, requireAdmin, (req, res) => {
  const auditQuery = `
    SELECT
      a.audit_id,
      a.start_time,
      a.end_time,
      s.name as station_name,
      u.username as auditor,
      COUNT(CASE WHEN ad.status = 'Found' THEN 1 END) as found_count,
      COUNT(CASE WHEN ad.status = 'Missing' THEN 1 END) as missing_count,
      COUNT(CASE WHEN ad.status = 'Misplaced' THEN 1 END) as misplaced_count,
      DATE(a.start_time) as audit_date
    FROM audits a
    JOIN stations s ON a.station_id = s.station_id
    JOIN users u ON a.user_id = u.user_id
    LEFT JOIN audit_details ad ON a.audit_id = ad.audit_id
    WHERE a.status = 'completed'
    GROUP BY a.audit_id
    ORDER BY a.start_time DESC
  `;

  const missingQuery = `
    SELECT ad.audit_id, i.item_name
    FROM audit_details ad
    JOIN items i ON ad.item_id = i.item_id
    WHERE ad.status = 'Missing'
  `;

  db.all(auditQuery, [], (err, audits) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(missingQuery, [], (err, missing) => {
      if (err) return res.status(500).json({ error: err.message });

      const missingByAudit = {};
      missing.forEach(m => {
        if (!missingByAudit[m.audit_id]) missingByAudit[m.audit_id] = [];
        missingByAudit[m.audit_id].push(m.item_name);
      });

      const grouped = {};
      audits.forEach(a => {
        a.missing_items = missingByAudit[a.audit_id] || [];
        if (!grouped[a.audit_date]) grouped[a.audit_date] = [];
        grouped[a.audit_date].push(a);
      });

      const result = Object.entries(grouped).map(([date, audits]) => ({ date, audits }));
      res.json(result);
    });
  });
});

// ==================== SETTINGS ROUTES ====================

// Get settings
app.get('/api/settings/:key', authenticateToken, (req, res) => {
  db.get('SELECT * FROM settings WHERE key = ?', [req.params.key], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || { key: req.params.key, value: '' });
  });
});

// Update settings (admin only)
app.post('/api/settings', authenticateToken, requireAdmin, (req, res) => {
  const { key, value } = req.body;

  db.run(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, new Date().toISOString()],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ key, value });
    }
  );
});

// ==================== BACKUP / RESTORE ENDPOINTS ====================

app.get('/api/backups', authenticateToken, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => /^audit_[\d_-]+\.db$/.test(f))
      .sort()
      .reverse() // newest first
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
      });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/create', authenticateToken, requireAdmin, (req, res) => {
  try {
    createBackup();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/restore', authenticateToken, requireAdmin, (req, res) => {
  const { filename } = req.body;
  if (!filename || !/^audit_[\d_-]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const src = path.join(backupDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });

  // Snapshot current db before overwriting (so restore is itself undoable)
  createBackup();

  res.json({ success: true, message: 'Restoring — server will restart in 2 seconds.' });

  // Flush writes then swap file and restart
  setTimeout(() => {
    db.close(() => {
      try {
        fs.copyFileSync(src, dbPath);
        console.log(`[backup] Restored from ${filename}`);
      } catch (e) {
        console.error('[backup] Restore copy failed:', e.message);
      }
      process.exit(0); // PM2 restarts automatically
    });
  }, 500);
});

// ==================== VERSION ENDPOINT ====================

app.get('/api/version', authenticateToken, (req, res) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const dbModified = fs.statSync(dbPath).mtime.toISOString().replace('T', ' ').slice(0, 19);

  const q = `SELECT MAX(ts) as last_updated FROM (
    SELECT MAX(created_at) as ts FROM stations
    UNION ALL SELECT MAX(created_at) as ts FROM items
    UNION ALL SELECT MAX(created_at) as ts FROM items_distribution
    UNION ALL SELECT MAX(start_time)  as ts FROM audits
    UNION ALL SELECT MAX(created_at) as ts FROM sub_locations
  )`;
  db.get(q, [], (err, row) => {
    res.json({
      app_version: pkg.version,
      last_modified: APP_LAST_MODIFIED,
      db_last_updated: (row && row.last_updated) ? row.last_updated : dbModified
    });
  });
});

// ==================== SERVE FRONTEND ====================

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Barcode Audit PWA Server running on port ${PORT}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Default admin credentials: admin / admin123`);
});

module.exports = app;
