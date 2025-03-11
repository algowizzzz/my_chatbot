import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './GraphVisualization.css';

/**
 * GraphVisualization component for visualizing entity relationships
 * @param {Object} props Component props
 * @param {Array} props.entities List of entities to visualize
 * @param {Array} props.relationships List of relationships between entities
 * @param {Function} props.onEntityClick Callback when an entity is clicked
 */
const GraphVisualization = ({ entities = [], relationships = [], onEntityClick }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!entities.length || !svgRef.current) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    // Get container dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = 400; // Fixed height, can be adjusted

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr("width", containerWidth)
      .attr("height", containerHeight);

    // Create a group for the graph
    const g = svg.append("g");

    // Create a zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    // Apply zoom behavior to svg
    svg.call(zoom);

    // Create nodes from entities
    const nodes = entities.map((entity, index) => ({
      id: entity.id || `entity_${index}`,
      name: entity.name || entity,
      type: entity.type || 'entity',
      count: entity.count || 1,
      relevance: entity.relevance || 0.5
    }));

    // Create links from relationships
    const links = relationships.map((rel, index) => ({
      id: rel.id || `rel_${index}`,
      source: rel.source || rel.from,
      target: rel.target || rel.to,
      type: rel.type || 'related',
      weight: rel.weight || 1
    }));

    // Create a force simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(containerWidth / 2, containerHeight / 2))
      .force("collide", d3.forceCollide().radius(d => Math.sqrt(d.count) * 10 + 20));

    // Create links
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke-width", d => Math.sqrt(d.weight) * 2);

    // Create node groups
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Add circles to nodes
    node.append("circle")
      .attr("r", d => Math.sqrt(d.count) * 10 + 10)
      .attr("fill", d => getNodeColor(d))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Add text labels to nodes
    node.append("text")
      .text(d => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("class", "node-label");

    // Add click event to nodes
    node.on("click", (event, d) => {
      if (onEntityClick) {
        onEntityClick(d);
      }
    });

    // Add hover effect
    node.on("mouseover", function() {
      d3.select(this).select("circle").attr("stroke", "#333").attr("stroke-width", 3);
    }).on("mouseout", function() {
      d3.select(this).select("circle").attr("stroke", "#fff").attr("stroke-width", 2);
    });

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Helper function to get node color based on type or relevance
    function getNodeColor(node) {
      // Color by type if available
      if (node.type === 'person') return '#4285F4'; // Blue
      if (node.type === 'organization') return '#EA4335'; // Red
      if (node.type === 'location') return '#34A853'; // Green
      if (node.type === 'date') return '#FBBC05'; // Yellow
      
      // Otherwise color by relevance
      if (node.relevance >= 0.8) return '#4285F4'; // High relevance - Blue
      if (node.relevance >= 0.5) return '#34A853'; // Medium relevance - Green
      return '#FBBC05'; // Low relevance - Yellow
    }

    // Initial zoom to fit content
    const initialTransform = d3.zoomIdentity.scale(0.8);
    svg.call(zoom.transform, initialTransform);

    // Cleanup function
    return () => {
      simulation.stop();
    };
  }, [entities, relationships, onEntityClick]);

  return (
    <div className="graph-visualization-container" ref={containerRef}>
      <svg ref={svgRef} className="graph-visualization"></svg>
    </div>
  );
};

export default GraphVisualization;
