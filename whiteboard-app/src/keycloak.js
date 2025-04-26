import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: "http://localhost:8080",
  realm: process.env.REACT_APP_KEYCLOAK_REALM,
  clientId: process.env.REACT_APP_KEYCLOAK_CLIENT_ID,
});

export default keycloak;
