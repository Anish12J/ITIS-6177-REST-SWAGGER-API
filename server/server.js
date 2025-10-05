
const express = require('express');
const mariadb = require('mariadb');

const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Swagger setup
const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Create MariaDB connection pool
const pool = mariadb.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'sample',
  port: 3306,
  connectionLimit: 5
});


app.get('/customers', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const customers = await conn.query('SELECT * FROM customer');
    res.json(customers);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/customers/:id', async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();

    const customerQuery = `
      SELECT c.*, a.AGENT_NAME, a.WORKING_AREA AS AGENT_AREA, a.PHONE_NO AS AGENT_PHONE
      FROM customer c
      JOIN agents a ON c.AGENT_CODE = a.AGENT_CODE
      WHERE c.CUST_CODE = ?
    `;
    const customer = await conn.query(customerQuery, [id]);

    if (customer.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const orders = await conn.query(
      'SELECT ORD_NUM, ORD_AMOUNT, ORD_DATE, AGENT_CODE FROM orders WHERE CUST_CODE = ?',
      [id]
    );

    res.json({ ...customer[0], orders });
  } catch (err) {
    console.error('Error fetching customer with agent and orders:', err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/orders', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const orders = await conn.query('SELECT * FROM orders');
    res.json(orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  } finally {
    if (conn) conn.release();
  }
});

//POST endpoint
app.post('/agents', async (req, res) => {
  const { agent_code, agent_name, working_area, commission, phone_no, country } = req.body;

  if (!agent_code || !agent_name || !working_area) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const query = `
      INSERT INTO agents (AGENT_CODE, AGENT_NAME, WORKING_AREA, COMMISSION, PHONE_NO, COUNTRY)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await conn.query(query, [
      agent_code,
      agent_name,
      working_area,
      commission || 0,
      phone_no || null,
      country || null
    ]);
    res.status(201).json({ message: 'Agent created successfully' });
  } catch (err) {
    console.error('Error adding agent:', err);
    res.status(500).json({ error: 'Failed to add agent' });
  } finally {
    if (conn) conn.release();
  }
});

// PATCH endpoint
app.patch('/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { cust_name, phone_no, city } = req.body;

  let conn;
  try {
    conn = await pool.getConnection();
    const query = `
      UPDATE customer 
      SET 
        CUST_NAME = COALESCE(?, CUST_NAME),
        PHONE_NO = COALESCE(?, PHONE_NO),
        CUST_CITY = COALESCE(?, CUST_CITY)
      WHERE CUST_CODE = ?
    `;
    const result = await conn.query(query, [cust_name, phone_no, city, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ message: 'Customer updated successfully' });
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT endpoint
app.put('/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { cust_code, agent_code, ord_amount, advance_amount, ord_date } = req.body;

  if (!cust_code || !agent_code || !ord_amount || !advance_amount || !ord_date) {
    return res.status(400).json({ error: 'Missing required fields for full update' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const query = `
      UPDATE orders 
      SET CUST_CODE = ?, AGENT_CODE = ?, ORD_AMOUNT = ?, ADVANCE_AMOUNT = ?, ORD_DATE = ?
      WHERE ORD_NUM = ?
    `;
    const result = await conn.query(query, [cust_code, agent_code, ord_amount, advance_amount, ord_date, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order fully updated successfully' });
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: 'Failed to update order' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE endpoint
app.delete('/orders/:id', async (req, res) => {
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query('DELETE FROM orders WHERE ORD_NUM = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: 'Failed to delete order' });
  } finally {
    if (conn) conn.release();
  }
});

const axios = require('axios');

// SAY endpoint
app.get('/say', async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    return res.status(400).json({ error: 'Missing query parameter: keyword' });
  }

  try {
    const cloudFunctionUrl = 'https://us-central1-itis-6177.cloudfunctions.net/sayFunction';

    const response = await axios.get(cloudFunctionUrl, {
      params: { keyword }
    });

    res.send(response.data);
  } catch (err) {
    console.error('Error calling cloud function:', err);
    res.status(500).json({ error: 'Failed to call cloud function' });
  }
});


// ---------------- START SERVER ----------------
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
