# syntax=docker/dockerfile:1.7

FROM debian:bookworm-slim AS libredwg-builder

ARG DEBIAN_MIRROR=http://mirrors.aliyun.com
ARG LIBREDWG_VERSION=0.14
ARG LIBREDWG_SOURCE_URL=https://github.com/LibreDWG/libredwg/releases/download/0.14/libredwg-0.14.tar.xz
ARG LIBREDWG_SHA256=62ebb73b984f865960f20ed26619ea5f8789d5e3fd088fa40a2598384da81275

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      libpcre2-dev \
      libxml2-dev \
      pkg-config \
      xz-utils \
      zlib1g-dev \
    && curl --fail --location --retry 5 --retry-delay 5 --connect-timeout 30 --max-time 600 \
      --output /tmp/libredwg.tar.xz "${LIBREDWG_SOURCE_URL}" \
    && echo "${LIBREDWG_SHA256}  /tmp/libredwg.tar.xz" | sha256sum --check --strict \
    && mkdir -p /tmp/libredwg-src /opt/libredwg \
    && tar --extract --xz --file /tmp/libredwg.tar.xz --directory /tmp/libredwg-src --strip-components=1 \
    && cd /tmp/libredwg-src \
    && ./configure \
      --prefix=/usr/local \
      --disable-bindings \
      --disable-python \
      --disable-json \
      --disable-docs \
    && make -C src -j"$(nproc)" \
    && make -C programs -j"$(nproc)" \
    && make -C src DESTDIR=/opt/libredwg install \
    && make -C programs DESTDIR=/opt/libredwg install

FROM python:3.12-slim-bookworm AS runtime

ARG DEBIAN_MIRROR=http://mirrors.aliyun.com
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    CAD_PREVIEW_COMMAND_TIMEOUT_SECONDS=90 \
    CAD_PREVIEW_MAX_UPLOAD_BYTES=52428800 \
    CAD_PREVIEW_MAX_LAYOUTS=20 \
    MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/cache

COPY --from=libredwg-builder /opt/libredwg/usr/local/ /usr/local/
COPY services/cad-preview/requirements.txt /tmp/requirements.txt
COPY assets/fonts/NotoSansCJKsc-Regular.otf /usr/local/share/fonts/mes-lite/NotoSansCJKsc-Regular.otf

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/root/.cache/pip \
    sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      fontconfig \
      libpcre2-8-0 \
      libxml2 \
      zlib1g \
    && ldconfig \
    && fc-cache -f \
    && pip install --disable-pip-version-check --no-cache-dir --index-url "${PIP_INDEX_URL}" -r /tmp/requirements.txt \
    && command -v dwg2dxf >/dev/null \
    && command -v dxf2dwg >/dev/null \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin cadpreview

WORKDIR /app
COPY --chown=cadpreview:cadpreview services/cad-preview/server.py services/cad-preview/smoke_test.py ./

RUN python smoke_test.py

USER cadpreview
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD ["python", "-c", "import os,urllib.request; token=os.getenv('CAD_PREVIEW_SERVICE_TOKEN',''); request=urllib.request.Request('http://127.0.0.1:8080/health',headers={'Authorization':f'Bearer {token}'} if token else {}); raise SystemExit(0 if urllib.request.urlopen(request,timeout=4).status==200 else 1)"]

CMD ["python", "server.py"]
