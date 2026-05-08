from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env.local", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    DATABASE_URL: str = "postgresql+asyncpg://titos:devpw@localhost:5432/titos"

    CORS_ORIGINS: str = "http://localhost:3000"

    # Phase 1 auth — shared secret on mutating endpoints. Without it the gate
    # fails closed (503) so a missing key on prod never silently allows writes.
    API_KEY: str | None = None

    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET: str = "titos-stats-videos"
    R2_PUBLIC_URL: str | None = None

    # Phase 3+; not used in Phase 1.
    ANTHROPIC_API_KEY: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
