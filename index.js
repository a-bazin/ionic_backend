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

app.post('/mark-as-sold', async (req, res) => {
  const { productId, userId } = req.body;  // Ajoute userId pour lier la vente à l'utilisateur
  if (!productId || !userId) {
    return res.status(400).send('productId ou userId manquant');
  }

  try {
    // Met à jour l'article comme vendu
    const productRef = db.collection('product').doc(productId);
    await productRef.update({ isSold: true });

    // Vérifie que la mise à jour a bien été effectuée
    const updatedProduct = await productRef.get();
    console.log('Produit mis à jour :', updatedProduct.data());

    // Ajoute à la collection sales
    const productSnapshot = await db.collection('product').doc(productId).get();
    const product = productSnapshot.data();

    await db.collection('sales').add({
      sellerId: userId,  // Associe l'utilisateur qui vend
      productId,
      productName: product?.name,  // Nom du produit
      isSeen: false,
      createdAt: new Date(),
    });

    res.send({ success: true, message: 'Produit marqué comme vendu et ajouté aux ventes' });
  } catch (err) {
    console.error('Erreur lors du marquage et ajout :', err);
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

    await db.collection('sales').add({
      sellerId: userDoc.data()?.id || userId,
      productId,
      productName,
      isSeen: false,
      createdAt: new Date()
    });

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

app.get('/sales/:sellerId', async (req, res) => {
  const { sellerId } = req.params;
  try {
    const snapshot = await db.collection('sales')
      .where('sellerId', '==', sellerId)
      .get();

    const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.send(sales);
  } catch (err) {
    console.error('Erreur récupération ventes :', err);
    res.status(500).send('Erreur récupération ventes');
  }
});

app.post('/sales/mark-seen', async (req, res) => {
  const { saleId } = req.body;
  if (!saleId) return res.status(400).send('saleId manquant');

  try {
    await db.collection('sales').doc(saleId).update({ isSeen: true });
    res.send({ success: true });
  } catch (err) {
    console.error('Erreur marquage comme vue :', err);
    res.status(500).send('Erreur marquage');
  }
});

app.post('/mark-sale-as-seen', async (req, res) => {
  const { saleId } = req.body;

  if (!saleId) {
    return res.status(400).send('saleId manquant');
  }

  try {
    await db.collection('sales').doc(saleId).update({
      isSeen: true
    });
    res.send({ success: true, message: 'Vente marquée comme vue' });
  } catch (err) {
    console.error('Erreur mise à jour isSeen :', err);
    res.status(500).send('Erreur serveur');
  }
});


app.post('/sales', async (req, res) => {
  const { userId, productName, productId } = req.body;
  if (!userId || !productName || !productId) {
    return res.status(400).send('userId, productName, ou productId manquant');
  }

  try {
    await db.collection('sales').add({
      sellerId: userId,
      productName,
      productId,
      isSeen: false,
      createdAt: new Date()
    });

    res.send({ success: true, message: 'Vente ajoutée avec succès' });
  } catch (err) {
    console.error('Erreur ajout vente:', err);
    res.status(500).send('Erreur serveur');
  }
});


app.get('/sales', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).send('userId manquant');
  }

  try {
    const snapshot = await db.collection('sales')
      .where('sellerId', '==', userId)
      .get();

    const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(sales);  // Retourne les ventes pour cet utilisateur
  } catch (err) {
    console.error('Erreur récupération ventes:', err);
    res.status(500).send('Erreur récupération ventes');
  }
});


// Middleware pour servir les fichiers statiques après les routes API
app.use('/public', express.static(path.join(__dirname, 'public')));

// Démarrer le serveur
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${port}`);
});
