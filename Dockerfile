FROM quay.io/keycloak/keycloak:latest

# Set environment variables for Keycloak admin
ENV KEYCLOAK_ADMIN=test
ENV KEYCLOAK_ADMIN_PASSWORD=test

# Expose Keycloak's default port
EXPOSE 8080

# Start Keycloak and bind to 0.0.0.0 to make it accessible externally
CMD ["-Dkeycloak.bind.address=0.0.0.0", "-Dkeycloak.profile=dev", "start"]
