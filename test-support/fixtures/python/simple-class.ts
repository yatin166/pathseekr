export const SIMPLE_CLASS = `
    import os
    import sys
    from pathlib import Path
    from typing import List, Optional
    
    
    class BaseProcessor:
        """Base processor class."""
    
        def process(self, data: str) -> str:
            raise NotImplementedError
    
        def get_name(self) -> str:
            return self.__class__.__name__
    
    
    class DataProcessor(BaseProcessor):
        """Processes data items."""
    
        def __init__(self, limit: int = 100):
            self.limit = limit
            self.count = 0
    
        def process(self, data: str) -> str:
            self.count += 1
            return data.strip()
    
        def get_count(self) -> int:
            return self.count
    
        def reset(self) -> None:
            self.count = 0
    
        def _helper(self) -> None:
            pass
    
    
    def create_processor(limit: int = 100) -> DataProcessor:
        """Creates a new DataProcessor instance."""
        return DataProcessor(limit)
    
    
    def format_result(result: str) -> str:
        return result.upper()
`