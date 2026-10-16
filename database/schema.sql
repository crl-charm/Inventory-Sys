-- Hardware Store Inventory & Daily Sales — schema for XAMPP / MariaDB.
-- Tested against MariaDB 10.4 (XAMPP). InnoDB, utf8mb4, CHECK constraints enforced.
--
-- Apply with either:
--   npm run db:init                (node script; uses DB_* vars from .env.local)
--   phpMyAdmin → import this file  (select the server, then Import)

CREATE DATABASE IF NOT EXISTS hardware_inventory
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hardware_inventory;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(80) NULL,
  name VARCHAR(180) NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  brand VARCHAR(120) NULL,
  variant VARCHAR(180) NULL,
  unit VARCHAR(40) NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  reorder_level DECIMAL(12,3) NOT NULL DEFAULT 5.000,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category_id),
  KEY idx_products_active_name (is_active, name),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_products_price CHECK (selling_price >= 0),
  CONSTRAINT chk_products_stock CHECK (stock_on_hand >= 0),
  CONSTRAINT chk_products_reorder CHECK (reorder_level >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_date DATE NOT NULL,
  notes TEXT NULL,
  status ENUM('posted','voided') NOT NULL DEFAULT 'posted',
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_by BIGINT UNSIGNED NULL,
  voided_at DATETIME NULL,
  void_reason TEXT NULL,
  request_id CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sale_batches_request_id (request_id),
  KEY idx_sale_batches_date (sale_date),
  KEY idx_sale_batches_status_date (status, sale_date),
  KEY idx_sale_batches_created_at (created_at),
  CONSTRAINT fk_sale_batches_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sale_batches_voided_by FOREIGN KEY (voided_by)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_sale_batches_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_batch_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name_snapshot VARCHAR(180) NOT NULL,
  sku_snapshot VARCHAR(80) NULL,
  unit_snapshot VARCHAR(40) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  base_unit_price DECIMAL(12,2) NOT NULL,
  final_unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sale_items_batch (sale_batch_id),
  KEY idx_sale_items_product (product_id),
  CONSTRAINT fk_sale_items_batch FOREIGN KEY (sale_batch_id)
    REFERENCES sale_batches(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_sale_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_sale_items_base_price CHECK (base_unit_price >= 0),
  CONSTRAINT chk_sale_items_final_price CHECK (final_unit_price >= 0),
  CONSTRAINT chk_sale_items_total CHECK (line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM(
    'opening',
    'sale',
    'stock_in',
    'sale_void_reversal',
    'physical_count_correction'
  ) NOT NULL,
  quantity_delta DECIMAL(12,3) NOT NULL,
  stock_before DECIMAL(12,3) NOT NULL,
  stock_after DECIMAL(12,3) NOT NULL,
  reference_type VARCHAR(40) NULL,
  reference_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_movements_product_date (product_id, created_at),
  KEY idx_stock_movements_type_date (movement_type, created_at),
  KEY idx_stock_movements_reference (reference_type, reference_id),
  CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_user FOREIGN KEY (created_by)
    REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_stock_movement_after CHECK (stock_after >= 0)
) ENGINE=InnoDB;

-- Seed categories (editable suggestions). INSERT IGNORE keeps re-runs safe.
INSERT IGNORE INTO categories (name) VALUES
  ('Engine Oil & Fluids'),
  ('Tires'),
  ('Mags & Wheels'),
  ('Hardware'),
  ('Other');
