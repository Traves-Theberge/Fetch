# TODO: customise for your stack. Serves ./public via nginx by default.
FROM nginx:alpine
COPY public/ /usr/share/nginx/html/
EXPOSE 80
