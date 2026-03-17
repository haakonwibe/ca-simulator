FROM node:alpine

WORKDIR /app

COPY . /app/

# Install dependencies
RUN npm install

# Expose the Vite dev server port
EXPOSE 5173

# Run the dev server, binding to all interfaces so it's accessible from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
