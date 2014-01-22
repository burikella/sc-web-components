SCs.SCnTree = function() {
    
};

SCs.SCnTree.prototype = {
    
    init: function(contourAddr) {
        this.nodes = [];
        this.addrs = [];    // array of sc-addrs
        this.links = [];
        this.triples = [];
        this.subtrees = {}; // dictionary of subtrees (contours)
        this.contourAddr = contourAddr;    // sc-addr of contour, that structure build with this tree
    },
    
    /**
     * Append new addr into sc-addrs list
     */
    _appendAddr: function(el) {
        if (!(el.type & sc_type_link) && this.addrs.indexOf(el.addr) < 0) {
            this.addrs.push(el.addr);
        }
    },
    
    /** Determine all subtrees in triples
     */
    determineSubTrees: function() {
        
        // collect subtree elements
        var subtrees = {};
        var idx = 0;
        
        function isElementExist(st, addr) {
            for (j in st.elements) {
                if (st.elements[j].el.addr == addr)
                    return true;
            }
            return false;
        }

        while (idx < this.triples.length) {
            var tpl = this.triples[idx];
            
            if ((tpl[1].type != sc_type_arc_pos_const_perm) || !(tpl[0].type & sc_type_node_struct) || (tpl[0].addr == this.contourAddr)) {
                idx++;
                continue;
            }
            
            // check if there are any input/output arcs
            tpl.ignore = true;
            for (k in this.triples) {
                if (this.triples[k][0].addr == tpl[1].addr || this.triples[k][2].addr == tpl[1].addr) {
                    tpl.ignore = false;
                    break;
                }
            }

            var st = subtrees[tpl[0].addr];
            if (st) {
                if (!isElementExist(st, tpl[2].addr))
                    st.elements.push({el: tpl[2], tpl: tpl});
            } else {
                subtrees[tpl[0].addr] = {el: tpl[0], elements: [{el: tpl[2], tpl: tpl}], triples: []};
            }
            
            idx++;
        }
        
        // we have elements, so we need to find all triples, where all element exist in subtree contour
        idx = 0;
        while (idx < this.triples.length) {
            var tpl = this.triples[idx];
            var used = false;
            for (addr in subtrees) {
                var st = subtrees[addr];
                
                if (!isElementExist(st, tpl[0].addr) || !isElementExist(st, tpl[1].addr) || !isElementExist(st, tpl[2].addr)) {
                    continue;
                }
                
                st.triples = st.triples.concat(this.triples.splice(idx, 1));
                used = true;
                break;
            }
            
            if (!used)
                idx++;
        }
        
        // if subtree has no any elements, then merge it back to main tree
        var delKeys = [];
        for (addr in subtrees) {
            if (subtrees[addr].elements.length == 0) {
                delKeys.push(addr);
            }
        }
        
        for (idx in delKeys) {
            delete subtrees[delKeys[idx]];
        }
        
        var self = this;
        
        // build tree objects
        for (addr in subtrees) {
            var subtree = subtrees[addr];
            var tree = new SCs.SCnTree();
            tree.init(subtree.el.addr);

            // determine keywords by input/output arcs number
            var keywords = {};
            function addArc(el, value) {
                    
                var n = value;
                if (el.type & (sc_type_arc_mask | sc_type_link)) 
                    n += -2; // minimize priority of arcs
                    
                if (keywords[el.addr]) 
                    keywords[el.addr].priority += n;
                else 
                    keywords[el.addr] = {el: el, priority: n};
            }
            
            //---
            for (idx in subtree.triples) {
                var tpl = subtree.triples[idx];
                var n = 1;
                
                if (tpl[2].type & sc_type_arc_mask | tpl[0].type & sc_type_link)
                    n -= 1; // minimize priority of nodes, that has output/input arcs to other arcs or links
                if (tpl[2].type & sc_type_link || tpl[0].type & sc_type_link)
                    n -= 1; // minimize priority of nodes, that has output/input arcs to links
                if (tpl[1].type & (sc_type_arc_common | sc_type_edge_common))
                    n += 1;

                if (tpl[0].addr != addr)
                    addArc(tpl[0], n);
                if (tpl[2].addr != addr)
                    addArc(tpl[2], n);
            }
            var keywordsList = [];
            var maxValue = -1;
            for (a in keywords) {
                var el = keywords[a];
                if (el.priority > maxValue) {
                    keywordsList = [el.el];
                    maxValue = el.priority;
                }
            }

            tree.build(keywordsList, subtree.triples);
            this.subtrees[addr] = tree;
            this.addrs = this.addrs.concat(tree.addrs);
        }
    },
    
    /*! Builds tree based on array of triples
     * @param {Array} keyords Array of keywords
     * @param {Array} triples Array of triples
     */
    build: function(keywords, triples) {
        var queue = [];
        this.triples = this.triples.concat(triples);
        // first of all we need to create root nodes for all keywords
        for (i in keywords) {
            var node = new SCs.SCnTreeNode();
            
            node.type = SCs.SCnTreeNodeType.Keyword;
            node.element = keywords[i];
            node.level = -1;
            
            this.nodes.push(node);
            queue.push(node);
        }
        
        this.determineSubTrees();
        this.buildLevels(queue, this.triples);
    },
    
    buildLevels: function(queue, triples) {
    
        while (queue.length > 0) {
            var node = queue.shift();
            
            // try to find triple that can be added as child to tree node
            var idx = 0;
            while (idx < triples.length) {
                var tpl = triples[idx];
                var found = false;
                var backward = false;
                
                if (!tpl.output && !tpl.ignore) {
                    // arc attributes
                    if (node.type == SCs.SCnTreeNodeType.Sentence) {
                        if ((tpl[0].type & (sc_type_node_role | sc_type_node_norole)) 
                                && (tpl[1].type & sc_type_arc_pos_const_perm | sc_type_var)
                                && tpl[2].addr == node.predicate.addr) {
                            node.attrs.push({n: tpl[0], a: tpl[1], triple: tpl});
                            tpl.output = true;
                            
                            this._appendAddr(tpl[0]);
                        }
                    }
                    
                    var predicate = null, el = null;
                    if (tpl[0].addr == node.element.addr) {
                        predicate = tpl[1];
                        el = tpl[2];
                        found = true;
                    }
                    
                    if (tpl[2].addr == node.element.addr) {
                        predicate = tpl[1];
                        el = tpl[0];
                        found = true;
                        backward = true;
                    }
                    
                    if (found) {
                        var nd = new SCs.SCnTreeNode();
            
                        nd.type = SCs.SCnTreeNodeType.Sentence;
                        nd.element = el;
                        nd.predicate = predicate;
                        nd.level = node.level + 1;
                        nd.parent = node;
                        nd.backward = backward;
                        tpl.scn = { treeNode: nd };
                        
                        node.childs.push(nd);
                        nd.triple = tpl;
                        tpl.output = true;
                        
                        queue.push(nd);
                        
                        this._appendAddr(tpl[0]);
                        this._appendAddr(tpl[1]);
                        this._appendAddr(tpl[2]);
                    }
                }
                
                ++idx;
            }
        }
    },
    
    /*! Destroy whole node sub-trees of specified node.
     * @param {Object} node Node to destroy
     */
    destroySubTree: function(node) {
        var queue = [node];
        
        while (queue.length > 0) {
            var n = queue.shift();
            for (idx in n.childs) {
                queue.push(n.childs[idx]);
            }
            
            // remove from parent
            if (n.parent) {
                for (idx in n.parent.childs) {
                    var i = n.parent.childs.indexOf(n);
                    if (i >= 0) {
                        n.parent.childs.splice(i, 1);
                    }
                }
            }
            
            for (idx in n.attrs) {
                n.attrs[idx].triple.ouput = false;
            }
            
            n.triple.output = false;
            n.triple = null;
            n.parent = null;
            
            for (idx in node.childs) {
                queue.push(node.childs[idx]);
            }
            node.childs.splice(0, node.childs.length);
        }
    }
    
};


// ----------------------------------------
SCs.SCnTreeNodeType = {
    Keyword: 1,
    Sentence: 2
};

SCs.SCnTreeNode = function() {
    this.type = SCs.SCnTreeNodeType.Sentence;
    this.element = null;
    this.childs = new Array();   // list of child sentences for subject
    this.attrs = new Array();   // list of attributes
    this.predicate = null;      // sc-addr of arc
    this.backward = false;      // backwards flag for predicates
    this.level = -1;             // tree level
    this.parent = null;         // parent tree node
};

SCs.SCnTreeNode.prototype = {
    
};
