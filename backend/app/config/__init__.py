"""
Configuration package for FloodWatch backend.

This package contains configuration modules including region-specific settings.
"""

from .region_config import RegionConfig, get_region_config

__all__ = ['RegionConfig', 'get_region_config']
