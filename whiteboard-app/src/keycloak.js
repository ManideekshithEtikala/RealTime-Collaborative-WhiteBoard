import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'testyt',
  clientId: 'myclient',
});

export default keycloak;
