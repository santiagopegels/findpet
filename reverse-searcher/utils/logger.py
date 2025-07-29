import logging
import sys
from functools import wraps
from pathlib import Path
from pythonjsonlogger import jsonlogger
from config import Config

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Formatter personalizado para logs en JSON"""
    
    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
        log_record['service'] = 'reverse-searcher'
        log_record['level'] = record.levelname
        log_record['timestamp'] = self.formatTime(record, self.datefmt)

def setup_logger(name: str = __name__) -> logging.Logger:
    """Configura el logger para el proyecto"""
    
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, Config.LOG_LEVEL.upper()))
    
    # Evitar duplicar handlers
    if logger.handlers:
        return logger
    
    # Handler para stdout
    handler = logging.StreamHandler(sys.stdout)
    
    if Config.LOG_FORMAT == 'json':
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(level)s %(name)s %(message)s'
        )
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    return logger

# Logger principal del módulo
logger = setup_logger('reverse_searcher')

def log_request_info(func):
    """Decorator para loggear información de requests"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        logger.info(f"Executing {func.__name__}", extra={
            'function': func.__name__,
            'args_count': len(args),
            'kwargs_count': len(kwargs)
        })
        try:
            result = func(*args, **kwargs)
            logger.info(f"Completed {func.__name__}", extra={
                'function': func.__name__,
                'status': 'success'
            })
            return result
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {str(e)}", extra={
                'function': func.__name__,
                'error': str(e),
                'status': 'error'
            })
            raise
    return wrapper 