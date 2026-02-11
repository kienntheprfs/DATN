import logging.config

def setup_logging():
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,

        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(name)s | %(message)s",
                "use_colors": True,
            },
        },

        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            },
        },

        "loggers": {
            "": {  # root logger
                "handlers": ["default"],
                "level": "INFO",
            },
        },
    })
