const express = require('express');
const app = express();
const port = 3000;
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialisation Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});


// Middleware CORS
app.use(cors());

// Middleware pour traiter les données JSON
app.use(express.json({ limit: '1000mb' }));

// Routes API avant les fichiers statiques
app.post('/uploads', (req, res) => {
    const { base64Image, photo } = req.body;

    if (!base64Image) {
        return res.status(400).send('Aucune image envoyée');
    }

    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const uploadDir = path.join(__dirname, 'public');

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir); // Crée le dossier s'il n'existe pas
    }

    fs.writeFile(path.join(uploadDir, photo.filepath), base64Data, 'base64', (err) => {
        if (err) {
            return res.status(500).send('Erreur lors de l\'enregistrement de l\'image');
        }
        return res.send('Bravo');
    });
});

// Route pour marquer un produit comme vendu
app.post('/mark-as-sold', async (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).send('productId manquant');
  }

  try {
    await db.collection('product').doc(productId).update({ isSold: true });
    res.send({ success: true, message: 'Produit marqué comme vendu' });
  } catch (err) {
    console.error('Erreur lors du marquage :', err);
    res.status(500).send('Erreur lors du marquage comme vendu');
  }
});

// Route pour l'achat (fake payment)
app.post('/fake-payment', async (req, res) => {
  const { userId, productName, productId } = req.body;
  if (!userId) return res.status(400).send('userId requis');

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      return res.status(404).send('Token FCM non trouvé');
    }

    const message = {
      notification: {
        title: 'Nouvelle vente',
        body: `Votre produit "${productName}" a été acheté`
      },
      data: {
        url: `/show/${productId.toString()}`,
      },
      token: fcmToken
    };

    await admin.messaging().send(message);
    res.send({ success: true, message: 'Notification envoyée avec succès' });
  } catch (err) {
    console.error('Erreur envoi test notification :', err);
    res.status(500).send('Erreur envoi notification');
  }
});

// Route pour récupérer tous les produits
app.get('/products', async (req, res) => {
  try {
    const snapshot = await db.collection('products').get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.send(products);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la récupération des produits');
  }
});

// Middleware pour servir les fichiers statiques après les routes API
app.use('/public', express.static(path.join(__dirname, 'public')));

// Démarrer le serveur
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${port}`);
});
