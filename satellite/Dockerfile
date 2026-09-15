FROM python:3.11-slim

# numpy et xarray ont besoin de ces libs C
RUN apt-get update && apt-get install -y --no-install-recommends \
    libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# Cache pip layer séparé de l'installation des libs lourdes
RUN pip install --no-cache-dir -r requirements.txt

COPY fetch_clarity.py .

# Lance le script via cron (une fois par jour à 04:00 UTC)
RUN apt-get update && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

RUN echo "0 4 * * * root /usr/local/bin/python /app/fetch_clarity.py >> /proc/1/fd/1 2>&1" \
    > /etc/cron.d/fetch-clarity \
    && chmod 0644 /etc/cron.d/fetch-clarity \
    && crontab /etc/cron.d/fetch-clarity

# Lance aussi une première fois au démarrage du conteneur
CMD ["/bin/sh", "-c", "python /app/fetch_clarity.py && cron -f"]
