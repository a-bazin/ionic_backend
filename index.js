const express = require('express')
const app = express()
const port = 3000


const cors = require('cors')
app.use(cors());

app.use(express.json({limit: '1000mb'}))

const path = require('path');
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Hello World!')
})

const fs = require('fs');
app.post('/uploads', (req, res) => {
   

    const { base64Image, photo } = req.body;

    console.log("photo");
    console.log(photo);
    
    if (!base64Image) {
        return res.status(400).send('Aucune image envoyée');
    }

  // Extraire le contenu du base64 (sans le préfixe 'data:image/png;base64,')
  const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  
  // Définir un chemin où enregistrer le fichier
  const uploadDir = path.join(__dirname, 'public');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir); // Créer le dossier s'il n'existe pas
  }

    // Sauvegarder le fichier image
    fs.writeFile((path.join(uploadDir, photo.filepath)), base64Data, 'base64', (err) => {
        if (err) {
            console.log(err);
            
        return res.status(500).send('Erreur lors de l\'enregistrement de l\'image');
    }
    return res.send('Bravo');

    });
    })


    /*************** NOTIFICATION **************** */
    const admin = require("firebase-admin");

    const serviceAccount = require("./serviceAccountKey.json");
        if (!admin.apps.length) {

        admin.initializeApp({

    credential: admin.credential.cert(serviceAccount),
    });
    }
    const db = admin.firestore();
    module.exports = { admin, db };


    app.post('/save-token', async (req, res) => {
        const { userId, token } = req.body;
        if (!userId || !token) {
        return res.status(400).send('Données manquantes');
        }
        try {
        await db.collection('users').doc(userId).set({ fcmToken: token },
        { merge: true });

        console.log("FCM" + token);
        
        res.send({ success: true });
        } catch (err) {
        console.error('Erreur Firestore:', err);
        res.status(500).send('Erreur enregistrement token');
        }
    });

    /****************************************************** */
//*****************************************ACHAT */
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
console.log(message);

      await admin.messaging().send(message);
      res.send({ success: true, message: 'Notification envoyée avec succès' });
    } catch (err) {
      console.error('Erreur envoi test notification :', err);
      res.status(500).send('Erreur envoi notification');
    }
});

// app.listen(PORT, () => {
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${port}`);
});
