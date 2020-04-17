# Client JavaScript de JeuWeb Push Server pour le navigateur

Le client JavaScript de JeuWeb Push Server, à charger dans le navigateur de vos joueurs.

Il permet de connecter vos joueurs à différents canaux grâce au protocole WebSocket, et d'exécuter du code à la réception des différents événements reçu sur chaque canal.

Un événement est défini par un nom et un contenu.

Par exemple, sur le canal "discussions", on peut recevoir un événément nommé `player-posted-messages` avec comme contenu du JSON :

```json
{
  "player": {
    "id": 42,
    "name": "Corwin"
  },
  "content": "Salut tout le monde !"
}
```

Ainsi, le code qui gère les événements `player-posted-messages` peut réagir à ce message en émettant un son et en ajoutant le message à la liste.


## Liens utiles
* [jwp-server](https://github.com/JeuWeb/jwp-server) : le serveur lui-même
* [jwp-php-client](https://github.com/JeuWeb/jwp-php-client) : le cient PHP
* [jwp-browser-client](https://github.com/JeuWeb/jwp-browser-client) : le client JavaScript pour le navigateur
* [jwp-php-example-app](https://github.com/JeuWeb/jwp-php-example-app) : une application d'exempl en PHP
