FROM quay.io/keycloak/keycloak:latest

ENV KEYCLOAK_ADMIN=test
ENV KEYCLOAK_ADMIN_PASSWORD=test

EXPOSE 8080

CMD ["start-dev"]
