import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080', // Keycloak server URL
  realm: 'whiteboard-realm',   // Replace with your realm name
  clientId: 'whiteboard-client', // Replace with your client ID
});

export default keycloak;