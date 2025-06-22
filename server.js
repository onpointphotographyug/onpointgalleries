const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;

const dbPath = path.join(__dirname, 'data', 'db.json');
const uploadsPath = path.join(__dirname, 'data', 'uploads');

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));
app.use('/uploads', express.static(uploadsPath));

// --- Multer Setup for file uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Helper Functions ---
async function readDb() {
    try {
        const data = await fs.readFile(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If file doesn't exist, return default structure
            return { clients: [], photos: [] };
        }
        throw error;
    }
}

async function writeDb(data) {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

// --- API Routes ---

// Get all data (clients and photos)
app.get('/api/data', async (req, res) => {
    try {
        const db = await readDb();
        res.json(db);
    } catch (error) {
        res.status(500).json({ message: "Error reading data", error });
    }
});

// Create a new client
app.post('/api/clients', async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Client name is required" });
        }
        const db = await readDb();
        const newId = db.clients.length > 0 ? Math.max(...db.clients.map(c => c.id)) + 1 : 1;
        const newClient = { id: newId, name, email, phone };
        db.clients.push(newClient);
        await writeDb(db);
        res.status(201).json(newClient);
    } catch (error) {
        res.status(500).json({ message: "Error creating client", error });
    }
});

// Delete a client
app.delete('/api/clients/:id', async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const db = await readDb();
        const clientIndex = db.clients.findIndex(c => c.id === clientId);

        if (clientIndex === -1) {
            return res.status(404).json({ message: "Client not found" });
        }

        db.clients.splice(clientIndex, 1);
        
        // Also delete photos associated with the client
        const photosToDelete = db.photos.filter(p => p.clientId === clientId);
        for (const photo of photosToDelete) {
            try {
                await fs.unlink(path.join(uploadsPath, path.basename(photo.url)));
            } catch (err) {
                // Log error but continue, maybe file was already deleted
                console.error(`Failed to delete photo file: ${photo.url}`, err);
            }
        }
        db.photos = db.photos.filter(p => p.clientId !== clientId);

        await writeDb(db);
        res.status(200).json({ message: "Client and associated photos deleted" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting client", error });
    }
});

// Upload photos for a client
app.post('/api/photos', upload.array('photos'), async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!clientId || !req.files || req.files.length === 0) {
            return res.status(400).json({ message: "Client ID and files are required" });
        }

        const db = await readDb();
        const maxId = db.photos.length > 0 ? Math.max(...db.photos.map(p => p.id)) : 0;
        
        const newPhotos = req.files.map((file, i) => ({
            id: maxId + i + 1,
            clientId: parseInt(clientId),
            name: file.originalname,
            url: `/uploads/${file.filename}`,
            size: file.size,
            uploaded: new Date().toISOString(),
            favorite: false
        }));

        db.photos.push(...newPhotos);
        await writeDb(db);
        res.status(201).json(newPhotos);
    } catch (error) {
        res.status(500).json({ message: "Error uploading photos", error });
    }
});


// Delete a photo
app.delete('/api/photos/:id', async (req, res) => {
    try {
        const photoId = parseInt(req.params.id);
        const db = await readDb();
        const photoIndex = db.photos.findIndex(p => p.id === photoId);

        if (photoIndex === -1) {
            return res.status(404).json({ message: "Photo not found" });
        }

        const photo = db.photos[photoIndex];
        db.photos.splice(photoIndex, 1);
        
        try {
            await fs.unlink(path.join(uploadsPath, path.basename(photo.url)));
        } catch (err) {
            console.error(`Failed to delete photo file: ${photo.url}`, err);
        }

        await writeDb(db);
        res.status(200).json({ message: "Photo deleted" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting photo", error });
    }
});


// Toggle favorite status of a photo
app.put('/api/photos/:id/favorite', async (req, res) => {
    try {
        const photoId = parseInt(req.params.id);
        const db = await readDb();
        const photo = db.photos.find(p => p.id === photoId);

        if (!photo) {
            return res.status(404).json({ message: "Photo not found" });
        }

        photo.favorite = !photo.favorite;
        await writeDb(db);
        res.json(photo);
    } catch (error) {
        res.status(500).json({ message: "Error updating photo", error });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); 