FROM postgres:17-alpine AS vector-build
RUN apk add --no-cache build-base git
RUN git clone --depth 1 --branch v0.8.6 https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
    && make -C /tmp/pgvector install with_llvm=no

FROM postgres:17-alpine
COPY --from=vector-build /usr/local/lib/postgresql/vector.so /usr/local/lib/postgresql/vector.so
COPY --from=vector-build /usr/local/share/postgresql/extension/vector* /usr/local/share/postgresql/extension/
