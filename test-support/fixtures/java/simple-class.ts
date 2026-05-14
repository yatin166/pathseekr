export const SIMPLE_CLASS = `
    import java.util.List;
    import java.util.ArrayList;
    
    public interface IProcessor {
        String process(String input);
        boolean isReady();
    }
    
    public enum ProcessorStatus {
        IDLE,
        RUNNING,
        ERROR
    }
    
    public class BaseProcessor implements IProcessor {
    
        protected final String name;
    
        public BaseProcessor(String name) {
            this.name = name;
        }
    
        public String process(String input) {
            return input.trim();
        }
    
        public boolean isReady() {
            return true;
        }
    
        public String getName() {
            return name;
        }
    
        private void internalReset() {
            // private — should not be extracted
        }
    }
    
    public class DataProcessor extends BaseProcessor {
    
        private int count;
    
        public DataProcessor() {
            super("DataProcessor");
            this.count = 0;
        }
    
        public String process(String input) {
            count++;
            return input.trim().toLowerCase();
        }
    
        public int getCount() {
            return count;
        }
    
        public void reset() {
            count = 0;
        }
    
        private void helper() {
            // private — should not be extracted
        }
    }
`