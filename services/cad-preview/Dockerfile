# syntax=docker/dockerfile:1.7

ARG DOTNET_SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim

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

FROM ${DOTNET_SDK_IMAGE} AS acadsharp-builder

ARG NUGET_SOURCE=https://api.nuget.org/v3/index.json
WORKDIR /src
COPY services/cad-preview/engines/acadsharp/AcadSharpDwgToDxf.csproj ./
RUN --mount=type=cache,target=/root/.nuget/packages,sharing=locked \
    for attempt in 1 2 3; do \
      timeout 600 dotnet restore AcadSharpDwgToDxf.csproj \
        --source "${NUGET_SOURCE}" \
        --disable-parallel \
        && break; \
      if [ "${attempt}" = 3 ]; then exit 1; fi; \
      sleep "$((attempt * 5))"; \
    done
COPY services/cad-preview/engines/acadsharp/Program.cs ./
RUN --mount=type=cache,target=/root/.nuget/packages,sharing=locked \
    timeout 600 dotnet publish AcadSharpDwgToDxf.csproj \
      --configuration Release \
      --runtime linux-x64 \
      --no-restore \
      --output /out

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
    CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS=2 \
    CAD_PREVIEW_QUEUE_TIMEOUT_SECONDS=120 \
    CAD_PREVIEW_LIBREDWG_COMMAND=dwg2dxf \
    CAD_PREVIEW_ACADSHARP_COMMAND=/usr/local/bin/acadsharp-dwg2dxf \
    CAD_PREVIEW_AUTO_ENGINE_ORDER=qcad,acadsharp,libredwg \
    CAD_PREVIEW_FONT_DIRS=/usr/local/share/fonts/mes-lite:/opt/cad-fonts \
    CAD_PREVIEW_MANAGED_FONT_DIRS=/opt/cad-fonts \
    MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/cache

COPY --from=libredwg-builder /opt/libredwg/usr/local/ /usr/local/
COPY --from=acadsharp-builder /out/AcadSharpDwgToDxf /usr/local/bin/acadsharp-dwg2dxf
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
      util-linux \
      zlib1g \
    && ldconfig \
    && fc-cache -f \
    && pip install --disable-pip-version-check --no-cache-dir --index-url "${PIP_INDEX_URL}" -r /tmp/requirements.txt \
    && chmod 0755 /usr/local/bin/acadsharp-dwg2dxf \
    && command -v dwg2dxf >/dev/null \
    && command -v dxf2dwg >/dev/null \
    && command -v acadsharp-dwg2dxf >/dev/null \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin cadpreview \
    && mkdir -p /opt/cad-fonts \
    && chown cadpreview:cadpreview /opt/cad-fonts

WORKDIR /app
COPY --chown=cadpreview:cadpreview services/cad-preview/server.py services/cad-preview/smoke_test.py ./
COPY services/cad-preview/entrypoint.sh /usr/local/bin/cad-preview-entrypoint.sh

RUN chmod 0755 /usr/local/bin/cad-preview-entrypoint.sh \
    && /usr/local/bin/cad-preview-entrypoint.sh python smoke_test.py \
    && rm -rf /tmp/cache /tmp/matplotlib

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD ["python", "-c", "import os,urllib.request; token=os.getenv('CAD_PREVIEW_SERVICE_TOKEN',''); request=urllib.request.Request('http://127.0.0.1:8080/health',headers={'Authorization':f'Bearer {token}'} if token else {}); raise SystemExit(0 if urllib.request.urlopen(request,timeout=4).status==200 else 1)"]

ENTRYPOINT ["/usr/local/bin/cad-preview-entrypoint.sh"]
CMD ["python", "server.py"]
