var SCgDebug = {
    
    enabled: false,
    
    error: function(message) {
        if (!this.enabled) return; // do nothing
        
        throw message;
    }
    
}
